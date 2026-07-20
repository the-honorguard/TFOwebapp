const formatDate = (value) => {
  if (!value) return '';
  return new Intl.DateTimeFormat('nl-NL', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
};

export default function Notifications({ open, notifications, loading, onToggle, onRead, onReadAll, onOpenOperation }) {
  const unread = notifications.filter((item) => !item.readAt).length;

  return (
    <div className="notifications-root">
      <button className="notification-trigger secondary" onClick={onToggle} aria-expanded={open} aria-label={`Notifications, ${unread} unread`}>
        <span aria-hidden="true">🔔</span>
        <span className="notification-trigger-label">Notifications</span>
        {unread > 0 ? <span className="notification-badge">{unread > 99 ? '99+' : unread}</span> : null}
      </button>
      {open ? (
        <aside className="notification-sidebar" aria-label="Notifications">
          <div className="notification-sidebar-head">
            <div><h2>Notifications</h2><span>{unread} unread</span></div>
            <div className="notification-head-actions">
              {unread > 0 ? <button className="secondary small" onClick={onReadAll}>Mark all read</button> : null}
              <button className="secondary small notification-close" onClick={onToggle} aria-label="Close">×</button>
            </div>
          </div>
          <div className="notification-list">
            {loading ? <p className="notification-empty">Loading notifications…</p> : null}
            {!loading && notifications.length === 0 ? <p className="notification-empty">You do not have any notifications yet.</p> : null}
            {notifications.map((item) => (
              <button
                key={item.id}
                className={`notification-item${item.readAt ? '' : ' unread'}`}
                onClick={() => {
                  if (!item.readAt) onRead(item.id);
                  if (item.entityType === 'operation' && item.entityId) onOpenOperation(item.entityId);
                }}
              >
                <span className="notification-dot" aria-hidden="true" />
                <span className="notification-content">
                  <strong>{item.title}</strong>
                  <span>{item.message}</span>
                  <small>{item.actorName ? `${item.actorName} · ` : ''}{formatDate(item.createdAt)}</small>
                </span>
              </button>
            ))}
          </div>
        </aside>
      ) : null}
    </div>
  );
}
