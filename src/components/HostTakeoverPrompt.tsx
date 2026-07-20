"use client";

import CosmosCanvas from "@/components/three/CosmosCanvas";

/**
 * Shown on a Host/TV view when it isn't the one live screen for this saga —
 * either because another screen already has it open ("conflict", first visit)
 * or because a different screen just took over mid-session ("deposed"). Both
 * cases resolve the same way: confirming installs THIS tab as the live session.
 */
export default function HostTakeoverPrompt({
  mode,
  onTakeover
}: {
  mode: "conflict" | "deposed";
  onTakeover: () => void;
}) {
  const copy =
    mode === "conflict"
      ? {
          title: "Already open on another screen",
          body: "This saga is already live on another screen right now. Taking over here will silence that one — music and effects will move to this screen instead.",
          action: "Take over this screen"
        }
      : {
          title: "This saga moved to another screen",
          body: "Another screen took over as the table's TV. This one has gone quiet — reclaim it if that was a mistake, or leave it be if the other screen is now the real one.",
          action: "Reclaim this screen"
        };

  return (
    <div className="screen loading-screen">
      <CosmosCanvas drama={0.35} />
      <div className="portal-veil" />
      <div className="loading-center">
        <h1 className="join-title small">{copy.title}</h1>
        <p className="panel-hint">{copy.body}</p>
        <button className="primary-button" onClick={onTakeover}>
          {copy.action}
        </button>
      </div>
    </div>
  );
}
