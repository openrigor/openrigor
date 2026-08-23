/**
 * Teaching role routing.
 *
 * `/` is the public marketing landing (for everyone). The student assignment
 * workspace lives at `/student/assignment/[id]` (threadId/readonly stay query
 * params). Role dashboards (`/student`, `/teacher`, `/owner`) are
 * server-gated here so a gate that is only client-side cannot be bypassed.
 */

/** Whether `/` may render the legacy canvas workspace. */
export function allowsTeachingHomeCanvas(_opts: {
  isTeaching: boolean;
  isOwner: boolean;
  isTeacher: boolean;
  hasAssignment: boolean;
}): boolean {
  // `/` is now the public landing — never rendered as the canvas workspace.
  return false;
}

/**
 * Role home for a user who is not allowed on the current teaching path.
 * Returns null when the path is allowed (or teaching mode is off).
 *
 * `/teacher` requires isTeacher (org admin or delegated teacher).
 * `/owner` requires isOwner. Students must not see either UI.
 * Research materials are public documentation, not an in-app persona.
 */
export function deniedTeachingRoleRedirect(opts: {
  isTeaching: boolean;
  pathname: string;
  isOwner: boolean;
  isTeacher: boolean;
  isResearcher: boolean;
}): "/owner" | "/teacher" | "/student" | null {
  if (!opts.isTeaching) return null;

  const onTeacher =
    opts.pathname === "/teacher" || opts.pathname.startsWith("/teacher/");
  const onOwner =
    opts.pathname === "/owner" || opts.pathname.startsWith("/owner/");
  if (onTeacher && !opts.isTeacher) {
    return opts.isOwner ? "/owner" : "/student";
  }
  if (onOwner && !opts.isOwner) {
    return opts.isTeacher ? "/teacher" : "/student";
  }
  // Research is a public external site; it has no in-app role gate.
  if (
    opts.pathname === "/researcher" ||
    opts.pathname.startsWith("/researcher/")
  ) {
    return null;
  }
  return null;
}

/** Shared cookie so knowledge.evaluchat.org can detect an app session. */
export const SESSION_MARKER_COOKIE = "ec_authed";

/**
 * Parent-domain cookie scope for evaluchat hosts so docs.* can read the
 * session marker. Undefined on localhost / non-evaluchat hosts.
 */
export function sharedAuthCookieDomain(hostname: string): string | undefined {
  if (hostname === "evaluchat.org" || hostname.endsWith(".evaluchat.org")) {
    return ".evaluchat.org";
  }
  // Legacy host support during the domain cutover. New links and cookies use
  // .org; retaining this read scope avoids stranding existing sessions.
  if (hostname === "evaluchat.com" || hostname.endsWith(".evaluchat.com")) {
    return ".evaluchat.com";
  }
  return undefined;
}
