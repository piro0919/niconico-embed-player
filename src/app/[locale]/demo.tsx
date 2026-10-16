"use client";

import { useTranslations } from "next-intl";
import { type SubmitEvent, useEffect, useRef, useState } from "react";
import { createNiconicoEngine, type NiconicoEngine } from "../../index";

/**
 * A real embed driven by the package. Every control calls the player, and every
 * event the player reports goes into the log, so a blocked autoplay shows up as
 * onBlocked and the Play button starts it.
 */

const FIRST_VIDEO = "sm9";
const POLL_MS = 250;
const LOG_LIMIT = 50;
const SECONDS_PER_MINUTE = 60;
const DEFAULT_VOLUME = 100;
/** The skip buttons, in seconds */
const SKIPS = [-10, 10];

type Entry = { id: number; name: string; detail?: string; at: string };

function clock(seconds: number): string {
  const whole = Math.floor(seconds);
  const minutes = Math.floor(whole / SECONDS_PER_MINUTE);
  const rest = whole % SECONDS_PER_MINUTE;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

export function Demo() {
  const t = useTranslations("demo");
  const frameRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<NiconicoEngine | null>(null);
  const serialRef = useRef(0);
  const [videoId, setVideoId] = useState(FIRST_VIDEO);
  const [draft, setDraft] = useState(FIRST_VIDEO);
  const [hideComments, setHideComments] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(DEFAULT_VOLUME);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState({ current: 0, duration: 0 });
  const [log, setLog] = useState<Entry[]>([]);

  const add = (name: string, detail?: string) => {
    serialRef.current += 1;
    const entry = {
      at: new Date().toLocaleTimeString(),
      detail,
      id: serialRef.current,
      name,
    };
    setLog((previous) => [entry, ...previous].slice(0, LOG_LIMIT));
  };

  // The player is created once. Later changes go through its methods, so the
  // settings here are read at that moment only.
  // biome-ignore lint/correctness/useExhaustiveDependencies: created once on mount
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const player = createNiconicoEngine(
      frame,
      {
        hideComments,
        muted,
        videoId,
        volume,
      },
      {
        onBlocked: () => {
          setPlaying(false);
          add("onBlocked");
        },
        onEnded: () => {
          setPlaying(false);
          add("onEnded");
        },
        onError: (code) => add("onError", code),
        onPaused: () => {
          setPlaying(false);
          add("onPaused");
        },
        onPlaying: () => {
          setPlaying(true);
          add("onPlaying");
        },
      },
    );
    playerRef.current = player;
    const timer = setInterval(() => setTime(player.time()), POLL_MS);
    return () => {
      clearInterval(timer);
      player.destroy();
    };
  }, []);

  const load = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const id = draft.trim();
    if (!id) return;
    setVideoId(id);
    setPlaying(false);
    playerRef.current?.load(id);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="flex flex-col gap-4 lg:col-span-2">
        <div
          className="aspect-video w-full overflow-hidden rounded-lg border border-zinc-800 bg-black [&>iframe]:size-full"
          ref={frameRef}
        />

        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-sm">
          <button
            className="w-24 rounded-md border border-amber-400/60 px-4 py-2 text-amber-300 transition-colors hover:border-amber-300 hover:text-amber-200"
            onClick={() =>
              playing ? playerRef.current?.pause() : playerRef.current?.play()
            }
            type="button"
          >
            {playing ? t("pause") : t("play")}
          </button>

          <div className="flex gap-2">
            {SKIPS.map((seconds) => (
              <button
                className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:border-zinc-500"
                key={seconds}
                onClick={() => {
                  const player = playerRef.current;
                  if (!player) return;
                  player.seekBy(seconds);
                  setTime(player.time());
                }}
                type="button"
              >
                {seconds < 0
                  ? t("back", { seconds: -seconds })
                  : t("forward", { seconds })}
              </button>
            ))}
          </div>

          <label className="flex flex-1 items-center gap-3">
            <span className="sr-only">{t("seek")}</span>
            <input
              className="min-w-32 flex-1 accent-amber-400"
              max={Math.max(time.duration, 0)}
              min={0}
              onChange={(event) => {
                const player = playerRef.current;
                if (!player) return;
                player.seek(Number(event.target.value));
                // Show the new position at once. Left at the polled value, the
                // controlled slider snaps back and fires a second seek to it.
                setTime(player.time());
              }}
              step={1}
              type="range"
              value={Math.min(time.current, time.duration)}
            />
            <span className="font-mono text-xs whitespace-nowrap text-zinc-400 tabular-nums">
              {clock(time.current)} / {clock(time.duration)}
            </span>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-zinc-400">
          <label className="flex items-center gap-3">
            {t("volume")}
            <input
              className="w-32 accent-amber-400"
              max={100}
              min={0}
              onChange={(event) => {
                const next = Number(event.target.value);
                setVolume(next);
                playerRef.current?.setVolume(next);
              }}
              type="range"
              value={volume}
            />
            <span className="w-8 font-mono text-xs tabular-nums">{volume}</span>
          </label>

          <label className="flex items-center gap-2">
            <input
              checked={muted}
              className="accent-amber-400"
              onChange={(event) => {
                setMuted(event.target.checked);
                playerRef.current?.setMuted(event.target.checked);
              }}
              type="checkbox"
            />
            {t("mute")}
          </label>

          <label className="flex items-center gap-2">
            <input
              checked={hideComments}
              className="accent-amber-400"
              onChange={(event) => {
                setHideComments(event.target.checked);
                playerRef.current?.setCommentsHidden(event.target.checked);
              }}
              type="checkbox"
            />
            {t("hideComments")}
          </label>

          <button
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:border-zinc-500"
            onClick={() =>
              playerRef.current
                ?.requestFullscreen()
                .catch((error: Error) =>
                  add("requestFullscreen", error.message),
                )
            }
            type="button"
          >
            {t("fullscreen")}
          </button>

          <form className="flex items-center gap-2" onSubmit={load}>
            <label className="flex items-center gap-2">
              {t("videoId")}
              <input
                className="w-28 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 font-mono text-xs text-zinc-200"
                onChange={(event) => setDraft(event.target.value)}
                value={draft}
              />
            </label>
            <button
              className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:border-zinc-500"
              type="submit"
            >
              {t("load")}
            </button>
          </form>
        </div>
      </div>

      <section className="flex flex-col rounded-lg border border-zinc-800">
        <h2 className="border-b border-zinc-800 px-4 py-2 font-mono text-xs tracking-wide text-zinc-500 uppercase">
          {t("events")}
        </h2>
        {log.length === 0 ? (
          <p className="px-4 py-3 text-xs text-zinc-600">{t("noEvents")}</p>
        ) : (
          <ol className="max-h-96 overflow-y-auto font-mono text-xs">
            {log.map((entry) => (
              <li
                className="flex gap-3 border-b border-zinc-900 px-4 py-2"
                key={entry.id}
              >
                <span className="text-zinc-600 tabular-nums">{entry.at}</span>
                <span className="text-amber-300">{entry.name}</span>
                {entry.detail ? (
                  <span className="text-zinc-400">{entry.detail}</span>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
