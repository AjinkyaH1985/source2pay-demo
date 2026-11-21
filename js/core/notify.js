/* Source2Pay – in-app notifications + simulated e-mail outbox */
(function (g) {
  const PH = (g.PH = g.PH || {});
  const U = PH.U;
  const Notify = (PH.Notify = {});

  // to: { roles:[], users:[], vendorId }  – roles are internal roles only
  Notify.push = function ({ type, ref, to, title, body, link }) {
    const db = PH.db();
    const ev = PH.EVENTS.find((e) => e.type === type);
    const cfg = db.cfg.notifications[type];
    if (cfg && cfg.enabled === false) return null; // event switched off in Admin
    const n = { id: PH.nextId('notif'), at: U.iso(PH.now()), type, ref: ref || '', title: title || (ev ? ev.label : type), body: body || '', link: link || '', roles: (to && to.roles) || [], users: (to && to.users) || [], vendorId: (to && to.vendorId) || null, readBy: [] };
    db.notifs.push(n);
    if (db.notifs.length > 800) db.notifs.splice(0, 100);
    // e-mail simulation
    const recipients = [];
    n.roles.forEach((r) => db.users.filter((u) => u.role === r && u.active).slice(0, 1).forEach((u) => recipients.push(u.email)));
    n.users.forEach((id) => { const u = PH.userById(id); if (u) recipients.push(u.email); });
    if (n.vendorId) db.users.filter((u) => u.vendorId === n.vendorId && u.active).forEach((u) => recipients.push(u.email));
    if (recipients.length) {
      db.mails.push({ id: PH.nextId('mail'), at: n.at, type, ref: n.ref, to: U.uniq(recipients).join(', '), cc: (cfg && cfg.cc) || '', subject: (ev ? ev.subject : n.title).replace('{ref}', n.ref), body: n.body });
      if (db.mails.length > 500) db.mails.splice(0, 50);
    }
    return n;
  };

  Notify.visible = function (user) {
    if (!user) return [];
    return PH.db().notifs.filter((n) => {
      if (user.role === 'vendor') return (n.vendorId && n.vendorId === user.vendorId) || n.users.includes(user.id);
      if (n.vendorId && !n.roles.length && !n.users.length) return false; // vendor-only
      return n.roles.includes(user.role) || n.users.includes(user.id) || (user.role === 'admin' && !n.vendorId);
    }).sort((a, b) => (a.at < b.at ? 1 : -1));
  };
  Notify.unread = (user) => Notify.visible(user).filter((n) => !n.readBy.includes(user.id)).length;
  Notify.markRead = (user, id) => { PH.db().notifs.forEach((n) => { if ((!id || n.id === id) && !n.readBy.includes(user.id)) n.readBy.push(user.id); }); PH.Store.save(); };
})(typeof window !== 'undefined' ? window : globalThis);
