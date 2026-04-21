/**
 * Discover — teaser « lieu commun » : le booléen vient du serveur (`discover_shared_place_flags`),
 * jamais de nom de lieu sur la carte.
 * (`viewerId` réservé si un jour le client doit recouper la réponse RPC.)
 */
export function hasSharedPlace(
  profile: { has_shared_place?: boolean | null },
  _viewerId?: string | null,
): boolean {
  void _viewerId;
  return profile.has_shared_place === true;
}
