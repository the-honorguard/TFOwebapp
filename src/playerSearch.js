const normalizeSearchValue = (value) => String(value ?? '').trim().toLocaleLowerCase();

export function filterPlayers(users, query, ranks = [], permissionGroups = []) {
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedQuery) return users;

  const rankNames = new Map(ranks.map((rank) => [String(rank.id), `${rank.name || ''} ${rank.short || ''}`]));
  const groupNames = new Map(permissionGroups.map((group) => [String(group.slug), group.name || '']));

  return users.filter((user) => {
    const profile = user.profile || {};
    const searchableValues = [
      user.username,
      user.status,
      user.role,
      groupNames.get(String(user.role)),
      rankNames.get(String(user.rank)),
      profile.displayName,
      profile.firstName,
      profile.lastName,
      ...Object.entries(user.permissions || {})
        .filter(([, enabled]) => enabled)
        .map(([permission]) => permission)
    ];

    return searchableValues.some((value) => normalizeSearchValue(value).includes(normalizedQuery));
  });
}
