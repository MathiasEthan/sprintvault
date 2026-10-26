/**
 * Monotonic marker of Scrum changes. Clients poll it to know when to refresh their views.
 * Seeded with the start time so a server restart is also seen as a change.
 */
let version = Date.now();

export const ChangeFeed = {
  bump(): number {
    version += 1;
    return version;
  },
  current(): number {
    return version;
  },
};
