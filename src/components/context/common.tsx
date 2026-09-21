import type { PropsWithChildren, ReactNode } from 'react';
import { useGameRuntime } from '../../app/GameProvider';
import type { GameCommand } from '../../runtime/commands';

export function ContextLayout({ title, meta, children }: PropsWithChildren<{ title: string; meta: ReactNode }>) {
  return (
    <section className="context-strip" aria-live="polite">
      <div className="context-copy">
        <h1 className="context-title">{title}</h1>
        <p className="context-meta">{meta}</p>
      </div>
      <div className="context-actions">{children}</div>
    </section>
  );
}

export function ActionButton({ command, disabled = false, className = '', title, children }: PropsWithChildren<{
  command: GameCommand;
  disabled?: boolean;
  className?: string;
  title?: string;
}>) {
  return <CommandButton command={command} className={`action ${className}`.trim()} disabled={disabled} title={title}>{children}</CommandButton>;
}

export function CommandButton({ command, disabled = false, className, title, children }: PropsWithChildren<{
  command: GameCommand;
  disabled?: boolean;
  className: string;
  title?: string;
}>) {
  const runtime = useGameRuntime();
  return <button className={className} disabled={disabled} title={title} onClick={(event) => {
    runtime.unlockAudio();
    runtime.dispatch(command);
    // Pointer users can immediately continue with keyboard controls; Tab users retain focus.
    if (event.detail > 0) runtime.focusCanvas();
  }}>{children}</button>;
}
