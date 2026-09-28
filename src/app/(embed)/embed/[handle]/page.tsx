'use client';

import { use, useEffect, useState } from 'react';
import { SupportWidget } from '@/components/support/SupportWidget';
import { DEFAULT_EMBED, isValidHandle, parseEmbedOptions, type EmbedOptions } from '@/lib/support/embed';
import { isWorkspace, seedWorkspace, type SupportProfile } from '@/lib/demo/seed';

/**
 * The embed itself.
 *
 * It runs inside a sandboxed iframe on a page we do not control, so it assumes
 * nothing: no parent, no storage guarantees, no theme inherited from the host.
 * It reads the profile, draws, and links out. Nothing else.
 */
export default function EmbedPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = use(params);
  const [options, setOptions] = useState<EmbedOptions>(DEFAULT_EMBED);
  const [profile, setProfile] = useState<SupportProfile | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setOptions(parseEmbedOptions(new URLSearchParams(window.location.search)));
    // In this build the profile lives in the creator's own browser, so an embed
    // on a visitor's machine falls back to the seeded profile. Wiring it to the
    // gateway is a fetch here and nothing else changes.
    let p: SupportProfile | null = null;
    try {
      const raw = window.localStorage.getItem('tidepool.workspace.v1');
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      if (isWorkspace(parsed)) p = parsed.support;
    } catch {
      p = null;
    }
    setProfile(p ?? seedWorkspace().support);
    setReady(true);
  }, []);

  if (!isValidHandle(handle)) {
    return <div className="supportWidget compact"><span className="hint">Unknown handle.</span></div>;
  }
  if (!ready || !profile) {
    return <div className="supportWidget compact"><div className="skeleton" style={{ height: 96 }} /></div>;
  }

  return (
    <SupportWidget
      handle={handle}
      displayName={profile.displayName}
      goal={profile.goal}
      pledges={profile.pledges}
      payLink={profile.payLink}
      variant={options.variant}
      showSupporters={options.showSupporters}
      showGoal={options.showGoal}
      compact
    />
  );
}
