import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Shell, Spinner, TopBar } from '../components/ui';
import BottomNav from '../components/BottomNav';

export default function Notifications() {
  const [items, setItems] = useState(null);

  async function load() {
    try {
      const r = await api('/users/get-details');
      setItems(r.data.notifications || []);
    } catch {
      setItems([]);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function markAll() {
    await api('/users/markasreadnotification').catch(() => {});
    load();
  }

  return (
    <Shell>
      <TopBar
        title="Notifications"
        right={
          <button onClick={markAll} className="text-sm font-bold text-brand">
            Mark all
          </button>
        }
      />
      <main className="flex-1 space-y-2.5 px-5 pb-6">
        {items === null ? (
          <div className="flex justify-center py-16 text-navy">
            <Spinner className="h-7 w-7" />
          </div>
        ) : items.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted">You&apos;re all caught up 🎉</p>
        ) : (
          items.map((n) => (
            <div
              key={n.id}
              className={`card flex gap-3 rounded-2xl ${n.is_read ? 'opacity-70' : ''}`}
            >
              <span
                className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                  n.is_read ? 'bg-lav' : 'bg-brand'
                }`}
              />
              <div className="min-w-0">
                <p className="font-semibold">{n.title}</p>
                <p className="mt-0.5 text-sm text-muted">{n.message}</p>
                <p className="mt-1.5 text-xs text-faded">
                  {new Date(n.date).toLocaleString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
            </div>
          ))
        )}
      </main>
      <BottomNav />
    </Shell>
  );
}
