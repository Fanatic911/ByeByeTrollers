function hasAnyRole(member, roleIds) {
  if (!member || !Array.isArray(roleIds)) return false;
  return roleIds.some((id) => id && member.roles.cache.has(id));
}

function isAdmin(member, settings) {
  if (!member) return false;
  if (member.guild.ownerId === member.id) return true;
  if (member.permissions.has("Administrator")) return true;
  return hasAnyRole(member, settings.admin_role);
}

function isModerator(member, settings) {
  if (!member) return false;
  if (isAdmin(member, settings)) return true;
  if (member.permissions.has("ManageGuild")) return true;
  return hasAnyRole(member, settings.moderator_role);
}

module.exports = { hasAnyRole, isAdmin, isModerator };
