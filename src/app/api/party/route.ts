import { NextResponse } from "next/server";
import { getCampaign, getCampaignLock, saveCampaign, safePushDisplayEvent, ensureLocations, getFocusedLocation, getPlayerLocation, reconcilePresence, playerLastSeen, DEPARTURE_WEAVE_GRACE_MS, claimHostSession, isHostSessionToken, logCampaignEvent } from "@/lib/campaign/store";
import { listChatTargets, DEFAULT_CHAT_TARGET_ID, isChatTargetConfigured } from "@/lib/aqua/client";
import { runDungeonMaster, repaintBackdrop, resolveExplorationRound, advanceCombatAndRunEnemies, rotateSpotlight, waitForDmIdle, buildAbsenceBriefing, serverLog, serverError, getHousekeepingStatus, retryHousekeepingNow } from "@/lib/aqua/chat";
import { turnMode, deadlinePassed, syncFocusedMirror, getActiveLocation, isPartySplit } from "@/lib/campaign/turns";
import { isValidVoiceId } from "@/lib/tts/voices";
import { isSafeTtsServerHost } from "@/lib/tts/config";
import { MUSIC_THEMES, type MusicTheme } from "@/lib/campaign/musicTheme";

export const dynamic = "force-dynamic";

/**
 * Who may perform each party action.
 *
 *   leader — only the current party leader (the single player host). When no
 *            leader is set yet, any joined player qualifies: an unowned
 *            campaign has no host role to protect, and this preserves the
 *            original `start` semantics exactly.
 *   host   — the player host OR the live TV screen. The TV owns the stage
 *            controls in the Director's Drawer; the leader has the same powers
 *            from their phone.
 *   tv     — the TV screen only (its own telemetry and deadline backstops).
 *   player — any joined player, acting for themselves.
 *   open   — read-only, or self-gating (claimHost sits behind a user prompt).
 *
 * Declared as ONE table on purpose. With the check written inline per handler,
 * force-resolve, skip-turn, nudge, settings, reset-turn, set-background and
 * message editing all shipped with no check at all — anyone who could reach the
 * LAN and guess a campaign id could drive another table's session. An action
 * missing from this table falls through to `leader`, so a newly added action
 * fails closed instead of shipping open.
 */
type PartyAuthority = "leader" | "host" | "tv" | "player" | "open";

const ACTION_AUTHORITY: Record<string, PartyAuthority> = {
  start: "leader",
  switchModel: "leader",
  transferHost: "leader",
  retryHousekeeping: "leader",
  retryFailedTurn: "leader",
  sway: "host",
  nudge: "host",
  resolveRound: "host",
  skipTurn: "host",
  resetTurn: "host",
  setBackground: "host",
  updateSettings: "host",
  setMusicTheme: "host",
  editMessage: "host",
  editEvent: "host",
  presenting: "tv",
  sweepPresence: "tv",
  leave: "player",
  claimHost: "open",
  listChatTargets: "open",
  housekeepingStatus: "open"
};

const AUTHORITY_MESSAGE: Record<PartyAuthority, string> = {
  leader: "Only the party leader can do that",
  host: "Only the host screen or the party leader can do that",
  tv: "Only the host screen can do that",
  player: "You must be seated at this table to do that",
  open: "Not permitted"
};

export async function POST(request: Request) {
  let campaignId = "";
  let action = "";
  try {
    const body = await request.json().catch(() => ({}));
    campaignId = String(body.campaignId || "");
    action = String(body.action || "");
    serverLog("API party", `Incoming POST request | Campaign: ${campaignId} | Action: ${action}`);
    if (!campaignId || !action) return NextResponse.json({ error: "campaignId and action are required" }, { status: 400 });

    // Read-only projections are served WITHOUT taking the campaign lock. Both
    // are polled by the Director's Drawer, and a running turn holds the lock for
    // its whole duration — so queueing these behind it made the drawer's own
    // status requests hang for as long as the turn took, which is precisely
    // when a host most wants to read them.
    if (action === "listChatTargets" || action === "housekeepingStatus") {
      const campaign = await getCampaign(campaignId);
      if (action === "housekeepingStatus") {
        return NextResponse.json({ status: getHousekeepingStatus(campaign) });
      }
      // alias + label + model only — never base URLs or API keys. The current
      // selection is included so the UI can mark it, along with the outstanding
      // narration failure so both surfaces can show WHY the host is being asked
      // to pick, and offer the retry.
      const targets = listChatTargets();
      return NextResponse.json({
        targets,
        selectedChatTargetId: campaign.selectedChatTargetId || DEFAULT_CHAT_TARGET_ID,
        // False when an .env edit removed the alias this campaign is pinned to:
        // narration silently runs on the default, and the UI should say so
        // rather than showing a selector stuck on a target that is gone.
        selectedTargetConfigured: isChatTargetConfigured(campaign.selectedChatTargetId),
        narrationFailure: campaign.narrationFailure
          ? { ...campaign.narrationFailure, canRetry: !!campaign.narrationFailure.payload && !campaign.dmStatus }
          : undefined
      });
    }

    let isReleased = false;
    const release = await getCampaignLock(campaignId).acquire();
    const safeRelease = () => {
      if (!isReleased) {
        isReleased = true;
        release();
      }
    };

    try {
      // Single authorization gate for every action (see ACTION_AUTHORITY).
      const authority: PartyAuthority = ACTION_AUTHORITY[action] ?? "leader";
      if (authority !== "open") {
        const actorId = String(body.playerId || "");
        const hostToken = String(body.hostToken || "").trim();
        const subject = await getCampaign(campaignId);
        const isJoinedPlayer = !!actorId && subject.players.some((player) => player.id === actorId);
        // No leader claimed yet → any seated player counts as the host.
        const isLeader = subject.partyLeaderId ? subject.partyLeaderId === actorId : isJoinedPlayer;
        const isTv = !!hostToken && isHostSessionToken(campaignId, hostToken);
        const allowed =
          authority === "leader" ? isLeader
            : authority === "host" ? (isLeader || isTv)
              : authority === "tv" ? isTv
                : isJoinedPlayer;
        if (!allowed) {
          serverLog("API party", `Rejected unauthorized '${action}' on campaign ${campaignId} (needs ${authority})`);
          void logCampaignEvent(campaignId, "WARN", "Host", "Unauthorized party action rejected", {
            action,
            requiredAuthority: authority,
            actorPlayerId: actorId || undefined,
            actorIsJoined: isJoinedPlayer,
            hadHostToken: !!hostToken
          });
          return NextResponse.json({ error: AUTHORITY_MESSAGE[authority] }, { status: 403 });
        }
      }

      if (action === "start") {
        const campaign = await getCampaign(campaignId);

        // Duplicate start guard: if campaign is already active, return immediately
        if (campaign.status === "active") {
          serverLog("API party", `Campaign ${campaignId} is already active, skipping start initialization.`);
          return NextResponse.json({ campaign });
        }

        campaign.status = "active";
        campaign.overview = "The Dungeon Master is preparing the opening scene...";
        campaign.currentScene = "A quiet chamber where legends begin. The air is thick with anticipation.";
        await saveCampaign(campaign);

        const opener = [
          "Start the couch campaign now.",
          campaign.campaignType === "dnd"
            ? `Campaign type: Dungeons & Dragons (${campaign.rulesMode === "full" ? "full 5e rules" : "rules-light D&D"}).`
            : "Campaign type: standard tabletop RPG, not D&D. Preserve the setup's genre and do not add fantasy/D&D assumptions unless already present.",
          "Do these steps in order:",
          "1. Call generate_image for the opening background, and call update_location to seed the opening scene's objects, cover, exits, hazards, and a few useful narrative zones.",
          "2. Call write_campaign_file for quest_log.md with only the first active objective and immediate tasks, and write_campaign_file for storyline.md with your private arc (chapters, intended ending, 'Current: Chapter 1').",
          "3. If no ending/goal exists, decide hidden high-level win/loss conditions in storyline.md but do not put them in quest_log.md.",
          "4. Initialize every joined player with inventory, abilities, status/notes, stats, and phone actions (via update_campaign_state playerUpdates).",
          "5. Add any starting NPCs in npcUpdates. If a new NPC appears, call generate_image for their portrait first.",
          "6. Call set_ambience for the opening scene's mood" + (campaign.musicTheme ? "." : ", and call set_theme ONCE with the campaign's genre score."),
          "7. END by calling narrate_turn EXACTLY ONCE with the opening story beats, title, currentScene, overview, playerActions, and partyActions. Do not write prose or JSON outside of narrate_turn.",
          campaign.isRandomized ? "Surprise campaign: invent a creative campaign title and pass it as narrate_turn's title." : "",
          campaign.startingStory.trim() ? `Starting background story to adapt: ${campaign.startingStory}` : "No starting story was provided; adapt the joined player backgrounds into an opening scene."
        ].filter(Boolean).join("\n");

        // Release the HTTP request thread lock
        safeRelease();

        // Run campaign start narrative and image generation in the background
        (async () => {
          const bgRelease = await getCampaignLock(campaignId).acquire();
          try {
            serverLog("API party background", `Starting campaign setup narrative in background for campaign: ${campaignId}`);
            await runDungeonMaster(campaignId, "Party Leader", opener, { hiddenUserMessage: true });
            serverLog("API party background", `Campaign setup narrative completed successfully in background for campaign: ${campaignId}`);
          } catch (err) {
            serverError("API party background", `Failed to complete campaign setup narrative in background for campaign: ${campaignId}`, err);
          } finally {
            bgRelease();
          }
        })();

        return NextResponse.json({ campaign });
      }

      if (action === "sway") {
        const guidance = String(body.guidance || "").trim();
        if (!guidance) return NextResponse.json({ error: "guidance is required" }, { status: 400 });
        serverLog("API party", `Swaying campaign: ${campaignId} | Guidance: "${guidance}"`);
        const result = await runDungeonMaster(campaignId, "Game Master", `Game Master guidance: ${guidance}`, { hiddenUserMessage: true });
        return NextResponse.json(result);
      }

      if (action === "nudge") {
        serverLog("API party", `Nudge (repaint backdrop) for campaign: ${campaignId}`);
        const before = await getCampaign(campaignId);
        if (before.status !== "active") {
          return NextResponse.json({ error: "Can only nudge an active campaign" }, { status: 400 });
        }
        // Pure visual refresh: the scene-director reuses a fitting past backdrop
        // or paints a fresh one. No story turn, so pending choices are untouched.
        const campaign = await repaintBackdrop(campaignId, { force: true });
        return NextResponse.json({ campaign });
      }

      if (action === "resolveRound") {
        // Force-resolve the ACTIVE location's exploration round with whoever
        // locked in. Triggered by the party leader ("go now") or the host as a
        // deadline backstop. `auto` = deadline-driven only, to avoid racing.
        const campaign = await getCampaign(campaignId);
        ensureLocations(campaign);
        const loc = getActiveLocation(campaign) || getFocusedLocation(campaign);
        if (campaign.status !== "active" || turnMode(loc) !== "exploration") {
          return NextResponse.json({ campaign });
        }
        const pendingCount = Object.keys(loc.pendingActions || {}).length;
        if (!pendingCount) {
          // Split party, spotlight group idled past its whole window with no
          // lock-ins: hand the spotlight to the next location instead of
          // letting one silent group freeze the entire table.
          if (body.auto && isPartySplit(campaign) && deadlinePassed(loc)) {
            serverLog("API party", `Spotlight group at ${loc.name} idled past the deadline — rotating for ${campaignId}`);
            const rotated = await rotateSpotlight(campaignId, loc.id);
            return NextResponse.json({ campaign: rotated });
          }
          return NextResponse.json({ campaign });
        }
        if (body.auto && !deadlinePassed(loc)) return NextResponse.json({ campaign });
        serverLog("API party", `Resolving exploration round for ${campaignId}/${loc.id} (${pendingCount} locked in, auto=${!!body.auto})`);
        const resolved = await resolveExplorationRound(campaignId, loc.id);
        return NextResponse.json({ campaign: resolved });
      }

      if (action === "skipTurn") {
        // Advance the ACTIVE location's combat past an idle/absent active player.
        const campaign = await getCampaign(campaignId);
        ensureLocations(campaign);
        const loc = getActiveLocation(campaign) || getFocusedLocation(campaign);
        if (campaign.status !== "active" || turnMode(loc) !== "combat") {
          return NextResponse.json({ campaign });
        }
        if (body.auto && !deadlinePassed(loc)) return NextResponse.json({ campaign });
        const activeId = loc.turnState?.activeId;
        const actor = campaign.players.find((p) => p.id === activeId);
        if (actor) {
          safePushDisplayEvent(campaign, {
            type: "system",
            speaker: "SYSTEM",
            content: `${actor.characterName || actor.name} hesitates — the moment slips past.`
          });
          await saveCampaign(campaign);
        }
        serverLog("API party", `Skipping combat turn for ${campaignId}/${loc.id} (active=${activeId}, auto=${!!body.auto})`);
        const fresh = await advanceCombatAndRunEnemies(campaignId, loc.id);
        return NextResponse.json({ campaign: fresh });
      }

      if (action === "leave") {
        const campaign = await getCampaign(campaignId);
        ensureLocations(campaign);
        const pid = String(body.playerId || "");
        const player = campaign.players.find((p) => p.id === pid);
        if (!player) return NextResponse.json({ campaign });
        player.away = true;
        // Deliberate intent shouldn't wait out the accidental-disconnect
        // grace: backdate so the departure weave's grace check is already
        // satisfied and it narrates on the very next sweep, as before.
        player.awaySince = Date.now() - DEPARTURE_WEAVE_GRACE_MS;
        safePushDisplayEvent(campaign, {
          type: "system",
          speaker: "SYSTEM",
          content: `${player.characterName || player.name} steps away from the table.`
        });
        const loc = getPlayerLocation(campaign, pid);
        // Clear any pending lock-in so they don't hold up their location's round.
        if (loc.pendingActions) delete loc.pendingActions[pid];
        syncFocusedMirror(campaign);
        await saveCampaign(campaign);
        // If it was their combat turn, pass initiative on in that location.
        if (turnMode(loc) === "combat" && loc.turnState?.activeId === pid) {
          const fresh = await advanceCombatAndRunEnemies(campaignId, loc.id);
          return NextResponse.json({ campaign: fresh });
        }
        return NextResponse.json({ campaign });
      }

      if (action === "editMessage") {
        const campaign = await getCampaign(campaignId);
        const messageId = String(body.messageId || "");
        const content = String(body.content || "");
        serverLog("API party", `Editing assistant message: ${messageId} in campaign: ${campaignId}`);
        const message = campaign.messages.find((item) => item.id === messageId && item.role === "assistant");
        if (!message) return NextResponse.json({ error: "Assistant message not found" }, { status: 404 });
        message.content = content;
        await saveCampaign(campaign);
        return NextResponse.json({ campaign });
      }

      if (action === "editEvent") {
        const campaign = await getCampaign(campaignId);
        const eventId = String(body.eventId || "");
        const newContent = String(body.content || "");
        serverLog("API party", `Editing event: ${eventId} in campaign: ${campaignId}`);
        const event = campaign.displayEvents.find((e) => e.id === eventId);
        if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });
        
        const oldContent = event.content || "";
        event.content = newContent;

        // Sync with assistant messages
        for (let i = campaign.messages.length - 1; i >= 0; i--) {
          const msg = campaign.messages[i];
          if (msg.role === "assistant") {
            try {
              const startIdx = msg.content.indexOf("{");
              const endIdx = msg.content.lastIndexOf("}");
              if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
                const jsonStr = msg.content.substring(startIdx, endIdx + 1);
                const parsed = JSON.parse(jsonStr);
                let updated = false;
                if (parsed && Array.isArray(parsed.story)) {
                  for (const segment of parsed.story) {
                    if (segment && segment.content === oldContent && (!event.speaker || segment.speaker === event.speaker)) {
                      segment.content = newContent;
                      updated = true;
                    }
                  }
                }
                if (updated) {
                  msg.content = msg.content.substring(0, startIdx) + JSON.stringify(parsed) + msg.content.substring(endIdx + 1);
                  break;
                }
              }
            } catch (err) {
              // ignore
            }

            if (msg.content.trim() === oldContent.trim()) {
              msg.content = newContent;
              break;
            }
          }
        }

        await saveCampaign(campaign);
        return NextResponse.json({ campaign });
      }

      if (action === "resetTurn") {
        // Host-triggered recovery for a stuck turn (item #1): force-clear
        // dmStatus/dmPhase and restore whatever choices were on the table
        // before the stuck turn, without waiting for the stale-status timeout.
        // Use when a DM call is abandoned mid-retry (server restart, crashed
        // process) and the table is frozen with a permanent "weaving" lock.
        const campaign = await getCampaign(campaignId);
        if (!campaign.dmStatus) return NextResponse.json({ campaign });
        serverLog("API party", `Host force-reset a stuck turn for campaign: ${campaignId}`);
        campaign.dmStatus = undefined;
        campaign.dmPhase = undefined;
        safePushDisplayEvent(campaign, {
          type: "system",
          speaker: "SYSTEM",
          content: "The host reset a stalled turn — the table is unstuck."
        });
        await saveCampaign(campaign);
        return NextResponse.json({ campaign });
      }

      if (action === "sweepPresence") {
        // TV-driven presence backstop. Presence normally reconciles only when
        // someone acts, so a quiet table never notices a vanished phone. The
        // host sweeps every few seconds: flip timed-out players away, note the
        // transitions in the chronicle, and — one hero per sweep, never while
        // another turn runs — weave a departure out of (or a woven-out
        // returner back into) the story as a background DM turn. The pause
        // spinner on the TV keys off the dmStatus these turns set.
        const campaign = await getCampaign(campaignId);
        if (campaign.status !== "active") return NextResponse.json({ campaign });
        const storyStarted = campaign.displayEvents.some((e) => e.type === "narration" || e.type === "dialogue");
        const presence = reconcilePresence(campaign);
        for (const id of presence.wentAway) {
          const p = campaign.players.find((x) => x.id === id);
          if (p) safePushDisplayEvent(campaign, { type: "system", speaker: "SYSTEM", content: `${p.characterName || p.name} slips from the weave — disconnected.` });
        }
        for (const id of presence.returned) {
          const p = campaign.players.find((x) => x.id === id);
          if (p) safePushDisplayEvent(campaign, { type: "system", speaker: "SYSTEM", content: `${p.characterName || p.name} returns to the table.` });
        }

        const canWeave = storyStarted && !campaign.dmStatus;
        // A return weave needs a LIVE heartbeat, not presence's never-seen
        // grace — after a server restart every phone reads "present" for one
        // beat, and weaving a still-absent hero back in would be a lie.
        const beating = (playerId: string) => {
          const seen = playerLastSeen(campaignId, playerId);
          return seen !== undefined && Date.now() - seen < 15000;
        };
        const returning = canWeave ? campaign.players.find((p) => !p.away && p.wovenOut && beating(p.id)) : undefined;
        // Grace period: don't narrate a departure the instant `away` flips —
        // give a real wifi blip (or a table resuming while phones reconnect)
        // time to resolve first. Explicit "leave" backdates awaySince so a
        // deliberate exit still narrates promptly (see the `leave` action).
        const departed = !returning && canWeave
          ? campaign.players.find((p) => p.away && !p.wovenOut && p.awaySince && Date.now() - p.awaySince >= DEPARTURE_WEAVE_GRACE_MS)
          : undefined;
        if (returning) returning.wovenOut = false;
        if (departed) departed.wovenOut = true;
        if (presence.wentAway.length || presence.returned.length || returning || departed) {
          await saveCampaign(campaign);
        }

        const absenceBriefing = returning ? buildAbsenceBriefing(campaign, returning) : [];
        const weaveMessage = returning
          ? [
              `Player ${returning.characterName || returning.name} has rejoined the game after being disconnected!`,
              ...absenceBriefing,
              "Do these steps in order:",
              "1. Briefly weave their return into the current scene.",
              "2. Set their status to Active or Ready.",
              "3. Provide fresh playerActions for them and other active players.",
              "4. Reuse the current background unless a new image is clearly needed."
            ].join("\n")
          : departed
            ? [
                `Player ${departed.name} has disconnected from the game and timed out.`,
                `Their character${departed.characterName ? `, ${departed.characterName},` : ""} must gracefully exit the story for now.`,
                "Do these steps in order:",
                "1. Briefly weave their departure into the current scene (one or two in-world beats — no meta talk about phones or connections).",
                "2. Park the character somewhere safe and recoverable. Do NOT kill them or strip their items; they may return.",
                "3. Keep playerActions fresh for the remaining active players; give none to the departed hero.",
                "4. Reuse the current background image."
              ].join("\n")
            : null;

        if (returning) {
          serverLog("API party", `Rejoin briefing for ${returning.name}: ${absenceBriefing.join(" | ")}`);
        }

        if (weaveMessage) {
          const hero = (returning || departed)!;
          const isReturn = !!returning;
          safeRelease();
          (async () => {
            // Wait for the table to be genuinely idle — generation finished,
            // the TV done playing out the previous turn's beats, no half-locked
            // round — so the weave never talks over a story beat in flight.
            await waitForDmIdle(campaignId);
            const bgRelease = await getCampaignLock(campaignId).acquire();
            try {
              // The world may have moved while we waited on the lock: the
              // hero may be back (or gone again), or another turn may be
              // running. Re-check and, when skipping, revert the flag so a
              // later sweep retries instead of losing the weave forever.
              const fresh = await getCampaign(campaignId);
              const live = fresh.players.find((p) => p.id === hero.id);
              if (!live) return;
              const stateFlipped = isReturn ? !!live.away : !live.away;
              if (stateFlipped || fresh.dmStatus) {
                live.wovenOut = isReturn;
                await saveCampaign(fresh);
                return;
              }
              serverLog("API party background", `Weaving ${isReturn ? "return" : "departure"} for ${hero.name} in campaign: ${campaignId}`);
              await runDungeonMaster(campaignId, "SYSTEM", weaveMessage, { hiddenUserMessage: true });
            } catch (err) {
              serverError("API party background", `Failed to weave ${isReturn ? "return" : "departure"} for ${hero.name}`, err);
            } finally {
              bgRelease();
            }
          })();
        }
        return NextResponse.json({ campaign });
      }

      if (action === "claimHost") {
        // Explicit takeover, only reached after the user confirms the
        // "Already open on another screen — Take over?" prompt. Unconditionally
        // installs this token as the live TV session; the previously-live tab
        // detects the swap on its own next poll and goes silent.
        const token = String(body.hostToken || "").trim();
        if (!token) return NextResponse.json({ error: "hostToken is required" }, { status: 400 });
        claimHostSession(campaignId, token);
        serverLog("API party", `TV claimed host session for campaign: ${campaignId}`);
        return NextResponse.json({ ok: true });
      }

      if (action === "presenting") {
        // Lightweight playback-progress broadcast from the TV: no DM turn, no
        // saveCampaign lock contention beyond the usual mutex. Lets controllers
        // stay locked until the TV actually finishes typing/holding this turn's
        // beats (not just until the server finished generating them).
        const campaign = await getCampaign(campaignId);
        campaign.presenting = { active: !!body.active, updatedAt: Date.now() };
        await saveCampaign(campaign);
        return NextResponse.json({ campaign });
      }

      if (action === "setBackground") {
        const campaign = await getCampaign(campaignId);
        const url = String(body.url || "").trim();
        if (!url || !campaign.images.some((img) => img.url === url)) {
          return NextResponse.json({ error: "Unknown background url" }, { status: 400 });
        }
        campaign.currentImageUrl = url;
        await saveCampaign(campaign);
        return NextResponse.json({ campaign });
      }

      if (action === "updateSettings") {
        const campaign = await getCampaign(campaignId);
        serverLog("API party", `Updating settings for campaign: ${campaignId}`);
        if (body.showQuestOnTV !== undefined) campaign.showQuestOnTV = !!body.showQuestOnTV;
        if (body.showQuestOnController !== undefined) campaign.showQuestOnController = !!body.showQuestOnController;
        if (body.showPartyInventories !== undefined) campaign.showPartyInventories = !!body.showPartyInventories;
        if (body.showPartyAbilities !== undefined) campaign.showPartyAbilities = !!body.showPartyAbilities;
        if (body.showNpcInventories !== undefined) campaign.showNpcInventories = !!body.showNpcInventories;
        if (body.showNpcAbilities !== undefined) campaign.showNpcAbilities = !!body.showNpcAbilities;
        if (body.ttsEnabled !== undefined) campaign.ttsEnabled = !!body.ttsEnabled;
        if (body.ttsVolume !== undefined) {
          const volume = Number(body.ttsVolume);
          if (!Number.isFinite(volume)) return NextResponse.json({ error: "Voice volume must be a number" }, { status: 400 });
          campaign.ttsVolume = Math.max(0, Math.min(1, volume));
        }
        if (body.ttsServerPort !== undefined) {
          const port = Number(body.ttsServerPort);
          if (!Number.isInteger(port) || port < 1 || port > 65535) {
            return NextResponse.json({ error: "Voice server port must be between 1 and 65535" }, { status: 400 });
          }
          campaign.ttsServerPort = port;
        }
        if (body.ttsServerHost !== undefined) {
          const host = String(body.ttsServerHost || "").trim();
          if (!isSafeTtsServerHost(host)) {
            return NextResponse.json({ error: "Voice server host must be a local-network IP address" }, { status: 400 });
          }
          campaign.ttsServerHost = host;
        }
        if (body.ttsVoiceId !== undefined) {
          const voiceId = String(body.ttsVoiceId || "").trim();
          if (!voiceId) campaign.ttsVoiceId = undefined;
          else if (!isValidVoiceId(voiceId)) return NextResponse.json({ error: "Invalid voice" }, { status: 400 });
          else campaign.ttsVoiceId = voiceId;
        }
        await saveCampaign(campaign);
        return NextResponse.json({ campaign });
      }

      if (action === "setMusicTheme") {
        const campaign = await getCampaign(campaignId);
        const theme = String(body.theme || "").trim();
        if (theme && !MUSIC_THEMES.includes(theme as MusicTheme)) {
          return NextResponse.json({ error: "Unknown music theme" }, { status: 400 });
        }
        campaign.musicThemeOverride = theme ? theme : undefined;
        await saveCampaign(campaign);
        void logCampaignEvent(campaignId, "INFO", "Host", "BGM theme override changed", {
          theme: campaign.musicThemeOverride || "automatic"
        });
        return NextResponse.json({ campaign });
      }

      if (action === "switchModel") {
        // Manual narration target switch after a provider failure. MANUAL ONLY
        // — never auto-failed-over. Party-leader authority is enforced by the
        // gate at the top of this handler.
        const campaign = await getCampaign(campaignId);
        const playerId = String(body.playerId || "");
        const targetId = String(body.targetId || "").trim();
        const targets = listChatTargets();
        const candidate = targets.find((t) => t.id === targetId);
        if (!candidate) {
          return NextResponse.json({ error: "Unknown narration target" }, { status: 400 });
        }
        // Narration is entirely tool-driven (narrate_turn ends every turn and
        // all state changes go through tools), so a target declared without tool
        // support cannot narrate at all. Refuse it here rather than letting the
        // host switch onto it and discover a 400 "does not support tools" on
        // their next turn — which is exactly how this went wrong before.
        if (!candidate.supportsTools) {
          return NextResponse.json(
            { error: `${candidate.label} is configured as not supporting tool calling, which narration requires — pick another target` },
            { status: 400 }
          );
        }
        const previousTargetId = campaign.selectedChatTargetId || DEFAULT_CHAT_TARGET_ID;
        if (previousTargetId === targetId) {
          return NextResponse.json({ campaign });
        }
        campaign.selectedChatTargetId = targetId === DEFAULT_CHAT_TARGET_ID ? undefined : targetId;
        await saveCampaign(campaign);
        const target = targets.find((t) => t.id === targetId);
        serverLog("API party", `Host ${playerId} switched narration target ${previousTargetId} → ${targetId} for campaign: ${campaignId}`);
        void logCampaignEvent(campaignId, "INFO", "Provider", "Narration target switched", {
          actorPlayerId: playerId,
          from: previousTargetId,
          to: targetId,
          toLabel: target?.label,
          toModel: target?.model,
          // Why the host switched. Falls back to the failure that prompted it,
          // so the log explains the change even when the UI sent no reason.
          reason: String(body.reason || "").trim().slice(0, 200) ||
            (campaign.narrationFailure
              ? `after ${campaign.narrationFailure.code || campaign.narrationFailure.status || "a failure"} on ${campaign.narrationFailure.targetId}`
              : "host switch")
        });
        return NextResponse.json({ campaign });
      }

      if (action === "transferHost") {
        // Transfer the SINGLE player-host/party-leader role to another joined
        // player. Exclusive transfer — the current host loses authority
        // immediately. Party-leader authority is enforced by the gate at the top
        // of this handler. The live-TV hostToken system is separate and
        // unaffected.
        const campaign = await getCampaign(campaignId);
        const playerId = String(body.playerId || "");
        const targetPlayerId = String(body.targetPlayerId || "").trim();
        if (!targetPlayerId) {
          return NextResponse.json({ error: "targetPlayerId is required" }, { status: 400 });
        }
        if (targetPlayerId === playerId) {
          return NextResponse.json({ error: "You are already the host" }, { status: 400 });
        }
        const target = campaign.players.find((p) => p.id === targetPlayerId);
        if (!target) {
          return NextResponse.json({ error: "Target player is not in this campaign" }, { status: 400 });
        }
        if (target.away) {
          return NextResponse.json({ error: "Target player is currently away — pick an active player" }, { status: 400 });
        }
        const previousLeaderId = campaign.partyLeaderId;
        campaign.partyLeaderId = targetPlayerId;
        safePushDisplayEvent(campaign, {
          type: "system",
          speaker: "SYSTEM",
          content: `The host role passes to ${target.characterName || target.name}.`
        });
        await saveCampaign(campaign);
        serverLog("API party", `Host role transferred ${previousLeaderId} → ${targetPlayerId} for campaign: ${campaignId}`);
        void logCampaignEvent(campaignId, "INFO", "Host", "Host role transferred", {
          actorPlayerId: playerId,
          fromPlayerId: previousLeaderId,
          toPlayerId: targetPlayerId,
          toName: target.characterName || target.name
        });
        return NextResponse.json({ campaign });
      }

      if (action === "retryHousekeeping") {
        // Manual housekeeping retry: clears the failure cooldown/budget and
        // STARTS one sweep. Party-leader authority comes from the gate above.
        // The sweep runs detached — it must never hold up the table — so this
        // returns the pre-sweep status and the host refreshes to see the result.
        const playerId = String(body.playerId || "");
        const result = await retryHousekeepingNow(campaignId);
        serverLog("API party", `Host ${playerId} manually retried housekeeping for campaign: ${campaignId} (started=${result.ran})`);
        return NextResponse.json(result);
      }

      if (action === "retryFailedTurn") {
        // Replay the exact turn that exhausted its retries, on whatever target
        // is selected NOW. This is the other half of manual recovery: switching
        // the model alone doesn't un-stick a turn the table already lost, and
        // the composed action string can't be rebuilt from the restored choices
        // (an exploration round folds every lock-in into one prompt), so it was
        // preserved on campaign.narrationFailure.payload when the turn died.
        //
        // Never replays automatically and never re-runs a turn that succeeded:
        // narrationFailure is cleared by any successful turn.
        const campaign = await getCampaign(campaignId);
        const playerId = String(body.playerId || "");
        const failure = campaign.narrationFailure;
        if (!failure?.payload) {
          return NextResponse.json({ error: "There is no failed turn to retry" }, { status: 400 });
        }
        if (campaign.dmStatus) {
          return NextResponse.json({ error: "The Weaver is already working — wait for this turn to finish" }, { status: 409 });
        }
        const { playerName, action: failedAction } = failure.payload;
        const targetId = campaign.selectedChatTargetId || DEFAULT_CHAT_TARGET_ID;
        serverLog("API party", `Host ${playerId} retrying the failed turn for campaign ${campaignId} on target ${targetId}`);
        void logCampaignEvent(campaignId, "INFO", "Narration", "Failed turn retry requested", {
          actorPlayerId: playerId,
          target: targetId,
          originalFailure: { at: failure.at, targetId: failure.targetId, code: failure.code, status: failure.status }
        });
        // Claim the retry while the lock is STILL HELD by dropping the payload.
        // The turn itself runs detached (a slow provider must not time the HTTP
        // request out), so without a claim two quick taps — or a phone and the
        // TV together — would both pass the checks above and run the same turn
        // twice. If this retry fails too, runDungeonMaster's catch writes a
        // fresh failure with a fresh payload, so the host can try again.
        campaign.narrationFailure = { ...failure, payload: undefined };
        await saveCampaign(campaign);
        // hiddenUserMessage: the player's message was already pushed to the
        // transcript by the attempt that failed — pushing it again would
        // duplicate the beat on the TV.
        safeRelease();
        (async () => {
          const bgRelease = await getCampaignLock(campaignId).acquire();
          try {
            // The world may have moved while we waited for the lock: another
            // turn may have started (or finished) in between. Re-check rather
            // than talking over it.
            const fresh = await getCampaign(campaignId);
            if (fresh.dmStatus) {
              serverLog("API party background", `Abandoned the failed-turn retry for ${campaignId} — another turn is already running`);
              return;
            }
            await runDungeonMaster(campaignId, playerName, failedAction, { hiddenUserMessage: true });
          } catch (err) {
            serverError("API party background", `Retry of the failed turn also failed for campaign: ${campaignId}`, err);
          } finally {
            bgRelease();
          }
        })();
        return NextResponse.json({ retrying: true, target: targetId });
      }

      return NextResponse.json({ error: "Unknown party action" }, { status: 400 });
    } finally {
      safeRelease();
    }
  } catch (error) {
    serverError("API party", `Error processing party action '${action}' for campaign: ${campaignId}`, error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown party error" }, { status: 500 });
  }
}
