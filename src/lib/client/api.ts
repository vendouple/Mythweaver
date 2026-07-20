"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Campaign, CampaignSummary, Player, SuggestedAction } from "@/lib/campaign/types";

export type { Campaign, CampaignSummary, Player, SuggestedAction };

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${response.status})`);
  }
  return data as T;
}

function post<T>(url: string, body: Record<string, unknown>): Promise<T> {
  return request<T>(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

export const api = {
  listCampaigns: () => request<{ campaigns: CampaignSummary[] }>("/api/campaigns"),
  createCampaign: (body: Record<string, unknown>) => post<{ campaign: Campaign }>("/api/campaigns", body),
  getCampaign: (id: string, host?: boolean, playerId?: string, hostToken?: string) => {
    const qs = new URLSearchParams();
    if (host) qs.set("host", "1");
    if (playerId) qs.set("playerId", playerId);
    if (hostToken) qs.set("hostToken", hostToken);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return request<{ campaign: Campaign; hostActive?: boolean; hostSession?: { isLive: boolean } }>(
      `/api/campaigns/${encodeURIComponent(id)}${suffix}`
    );
  },
  deleteCampaign: (id: string) =>
    request<{ success: boolean }>(`/api/campaigns/${encodeURIComponent(id)}`, { method: "DELETE" }),
  /** Pre-join projection: who's currently disconnected and reclaimable, with
   *  no story/message content leaked to someone who hasn't joined yet. */
  peekReconnect: (id: string) =>
    request<{ id: string; title: string; status: string; reconnectable: { id: string; name: string; characterName?: string }[] }>(
      `/api/campaigns/${encodeURIComponent(id)}?peek=1`
    ),
  join: (body: Record<string, unknown>) =>
    post<{ campaignId: string; player: Player; isPartyLeader: boolean }>("/api/join", body),
  chat: (body: Record<string, unknown>) => post<{ campaign?: Campaign; error?: string }>("/api/chat", body),
  party: (body: Record<string, unknown>) => post<{ campaign?: Campaign; error?: string }>("/api/party", body),
  generate: (body: Record<string, unknown>) => post<{ result: Record<string, any> }>("/api/generate", body),
  generateSceneImage: (campaignId: string, prompt: string) =>
    post<{ campaign: Campaign }>("/api/image", { campaignId, prompt }),
  listMusic: () =>
    request<{ tracks: string[]; byContext: Record<string, string[]>; sfx: string[] }>("/api/music")
};

/**
 * Polls a campaign with an adaptive cadence: quick while the DM is weaving,
 * relaxed when the table is idle. Pass host=true so the server records the
 * TV heartbeat (used to gate mid-session joins).
 */
export function useCampaignPoll(campaignId: string | null, host: boolean, playerId?: string, hostToken?: string) {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [lost, setLost] = useState(false);
  // A transient state between the first failed poll and giving up (>4). Lets the
  // UI show "Reconnecting…" and auto-resume instead of flashing "unreachable".
  const [reconnecting, setReconnecting] = useState(false);
  const [hostActive, setHostActive] = useState(true);
  // Only meaningful when `host` is true: whether THIS tab's hostToken is the
  // one the server currently considers live (see touchHostSession). Stays
  // true for non-host pollers, who never receive a hostSession back.
  const [liveHost, setLiveHost] = useState(true);
  const campaignRef = useRef<Campaign | null>(null);
  const failures = useRef(0);

  const refresh = useCallback(async () => {
    if (!campaignId) return;
    try {
      const { campaign: next, hostActive: hostUp, hostSession } = await api.getCampaign(campaignId, host, playerId, hostToken);
      failures.current = 0;
      campaignRef.current = next;
      setCampaign(next);
      setLost(false);
      setReconnecting(false);
      setHostActive(hostUp !== false);
      if (hostSession) setLiveHost(hostSession.isLive);
    } catch {
      failures.current += 1;
      if (failures.current > 4) {
        setLost(true);
        setReconnecting(false);
      } else {
        setReconnecting(true);
      }
    }
  }, [campaignId, host, playerId, hostToken]);

  useEffect(() => {
    if (!campaignId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      await refresh();
      if (cancelled) return;
      const current = campaignRef.current;
      // Poll quickly while the DM is generating OR the TV is still presenting
      // this turn's beats, so a controller's lock releases promptly the
      // instant either one clears instead of lagging the idle poll cadence.
      const busy = !!current?.dmStatus || !!current?.presenting?.active;
      const idle = current?.status === "active" && !busy;
      timer = setTimeout(tick, busy ? 1600 : idle ? 4200 : 2800);
    };

    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [campaignId, host, refresh]);

  return { campaign, refresh, lost, reconnecting, hostActive, liveHost };
}

export type StoredSeat = {
  campaignId: string;
  playerId: string;
  name: string;
  isPartyLeader?: boolean;
};

const SEAT_KEY = "mythweaver.seat";

export function loadSeat(): StoredSeat | null {
  try {
    const raw = localStorage.getItem(SEAT_KEY);
    if (!raw) return null;
    const seat = JSON.parse(raw) as StoredSeat;
    return seat.campaignId && seat.playerId ? seat : null;
  } catch {
    return null;
  }
}

export function saveSeat(seat: StoredSeat) {
  try {
    localStorage.setItem(SEAT_KEY, JSON.stringify(seat));
  } catch {
    // Private-mode storage failures are non-fatal; the player can rejoin by code.
  }
}

export function clearSeat() {
  try {
    localStorage.removeItem(SEAT_KEY);
  } catch {
    // ignore
  }
}

/** Player/NPC accent colors arrive as CSS names or hex from the AI. */
export function accentColor(value: string | undefined, fallback = "#c9a35c"): string {
  if (!value) return fallback;
  const v = value.trim();
  if (!v) return fallback;
  if (/^#[0-9a-f]{3,8}$/i.test(v)) return v;
  if (/^[a-z]+$/i.test(v)) return v;
  return fallback;
}

export function createActionId() {
  return `act_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

const TV_TOKEN_KEY = "mythweaver.tvToken";

/**
 * Per-TAB identity for a Host/TV view — deliberately sessionStorage, NOT
 * localStorage (which is shared across tabs and would defeat telling one TV
 * apart from another). Persists across a refresh of the same tab, cleared
 * when the tab closes, so reopening the same physical screen doesn't spuriously
 * look like a rival TV taking over.
 */
export function getTvToken(): string {
  const fresh = () => `tv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  try {
    let token = sessionStorage.getItem(TV_TOKEN_KEY);
    if (!token) {
      token = fresh();
      sessionStorage.setItem(TV_TOKEN_KEY, token);
    }
    return token;
  } catch {
    // Private-mode storage failures only affect the takeover-prompt UX (this
    // tab may look like a "new" TV on every remount) — never correctness, the
    // server still only ever treats one token as live at a time.
    return fresh();
  }
}
