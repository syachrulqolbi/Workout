import type { ReactNode } from 'react';

type EmptyStateProps = {
  icon: ReactNode;
  title: string;
  copy: string;
  action: string;
  onAction: () => void;
};

export function EmptyState({ icon, title, copy, action, onAction }: EmptyStateProps) {
  return (
    <section className="empty-state">
      <span>{icon}</span>
      <h3>{title}</h3>
      <p>{copy}</p>
      <button className="small-dark-button" onClick={onAction}>{action}</button>
    </section>
  );
}
