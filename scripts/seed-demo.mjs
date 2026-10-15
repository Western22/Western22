#!/usr/bin/env node
/**
 * Demo data so a fresh environment never feels empty: 24 example people from
 * around the world with bucket lists, stories, comments, reactions and
 * finished groups (whose memories show on goal pages).
 *
 *   node scripts/seed-demo.mjs            # add demo data (safe to run again)
 *   node scripts/seed-demo.mjs --remove   # delete every demo account and its content
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SECRET_KEY.
 * Against anything other than localhost it also needs --yes.
 *
 * Safety and honesty:
 *   - Demo accounts use @demo.invalid emails (that domain can never receive
 *     mail) and are hidden from matching, so nobody sends a buddy request to
 *     a person who doesn't exist, and they never trigger notifications.
 *   - Their bios say they're example profiles.
 *   - Their groups are finished, so nobody can join them.
 *   - Meant for staging, demos and the first days after launch; remove them
 *     with --remove once real people have posted.
 */

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\/$/, "");
const key = process.env.SUPABASE_SECRET_KEY;
const args = new Set(process.argv.slice(2));
const DEMO_DOMAIN = "demo.invalid";

if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SECRET_KEY.");
  process.exit(1);
}
const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url);
if (!isLocal && !args.has("--yes")) {
  console.error(`This writes to ${url}. Re-run with --yes if that's intended.`);
  process.exit(1);
}

// Must match the interests allowed by profiles (migration 0003).
const ALLOWED_INTERESTS = new Set([
  "hiking", "diving", "surfing", "climbing", "skiing", "running", "cycling", "wildlife",
  "photography", "music", "festivals", "art", "history", "food", "cooking", "wine",
  "wellness", "languages", "volunteering", "road_trips", "camping", "nightlife", "dance", "space",
]);

const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

async function call(path, { method = "GET", body, prefer } = {}) {
  const res = await fetch(`${url}${path}`, {
    method,
    headers: { ...headers, ...(prefer ? { Prefer: prefer } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}
const rest = (table, opts) => call(`/rest/v1/${table}`, opts);

/** Every demo auth user (paged through the admin API). */
async function demoUsers() {
  const found = [];
  for (let page = 1; page < 100; page++) {
    const { users } = await call(`/auth/v1/admin/users?page=${page}&per_page=200`);
    found.push(...users.filter((u) => u.email?.endsWith(`@${DEMO_DOMAIN}`)));
    if (users.length < 200) break;
  }
  return found;
}

if (args.has("--remove")) {
  const users = await demoUsers();
  // Deleting the auth user cascades to the profile, items, stories, comments, reactions and memberships.
  for (const u of users) await call(`/auth/v1/admin/users/${u.id}`, { method: "DELETE" });
  console.log(`Removed ${users.length} demo accounts and their content.`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// The people. Names, cities and languages from many countries.
// ---------------------------------------------------------------------------
const PEOPLE = [
  ["Ama Owusu", "ama", "Accra", "GH", ["en", "ak"], ["hiking", "photography"]],
  ["Lucas Silva", "lucas", "São Paulo", "BR", ["pt", "en"], ["surfing", "music"]],
  ["Sofía Martínez", "sofia", "Buenos Aires", "AR", ["es", "en"], ["dance", "food"]],
  ["Kenji Tanaka", "kenji", "Osaka", "JP", ["ja", "en"], ["cycling", "photography"]],
  ["Priya Sharma", "priya", "Bengaluru", "IN", ["hi", "en"], ["wellness", "hiking"]],
  ["Marta Kowalska", "marta", "Kraków", "PL", ["pl", "en", "de"], ["skiing", "history"]],
  ["Jonas Becker", "jonas", "Hamburg", "DE", ["de", "en"], ["camping", "cycling"]],
  ["Camille Dubois", "camille", "Lyon", "FR", ["fr", "en"], ["food", "art"]],
  ["Diego Ramírez", "diego", "Mexico City", "MX", ["es", "en"], ["diving", "road_trips"]],
  ["Aisha Bello", "aisha", "Lagos", "NG", ["en", "yo"], ["music", "volunteering"]],
  ["Liam O'Connor", "liam", "Dublin", "IE", ["en", "ga"], ["running", "nightlife"]],
  ["Mei Lin", "mei", "Taipei", "TW", ["zh", "en"], ["food", "languages"]],
  ["Noah Williams", "noah", "Toronto", "CA", ["en", "fr"], ["camping", "climbing"]],
  ["Zanele Dlamini", "zanele", "Cape Town", "ZA", ["en", "zu"], ["wildlife", "hiking"]],
  ["Elif Yılmaz", "elif", "Istanbul", "TR", ["tr", "en"], ["history", "photography"]],
  ["Mateo Rossi", "mateo", "Bologna", "IT", ["it", "en"], ["food", "cycling"]],
  ["Hana Kim", "hana", "Seoul", "KR", ["ko", "en"], ["dance", "space"]],
  ["Olivia Brown", "olivia", "Melbourne", "AU", ["en"], ["surfing", "diving"]],
  ["Ahmed Hassan", "ahmed", "Cairo", "EG", ["ar", "en"], ["history", "space"]],
  ["Ingrid Larsen", "ingrid", "Bergen", "NO", ["no", "en"], ["skiing", "wildlife"]],
  ["Rahul Mehta", "rahul", "Mumbai", "IN", ["hi", "en", "mr"], ["running", "music"]],
  ["Lucía Fernández", "lucia", "Seville", "ES", ["es", "en"], ["dance", "art"]],
  ["Tom Nguyen", "tom", "Ho Chi Minh City", "VN", ["vi", "en"], ["food", "road_trips"]],
  ["Grace Mwangi", "grace", "Nairobi", "KE", ["en", "sw"], ["wildlife", "volunteering"]],
];

// Goals the demo people want, by slug (from the seeded catalogue; missing ones are skipped).
const WANTS = [
  "climb-mount-kilimanjaro", "see-the-northern-lights", "learn-to-scuba-dive", "walk-the-camino-de-santiago",
  "learn-sign-language", "learn-to-surf", "safari-in-the-serengeti", "run-a-marathon", "learn-tango-in-buenos-aires",
  "see-cherry-blossoms-in-japan", "go-skydiving", "hike-the-inca-trail", "visit-all-seven-continents",
  "become-fluent-in-a-new-language", "drive-route-66", "swim-with-whale-sharks",
];

const STORIES = [
  ["climb-mount-kilimanjaro", "ama", "Uhuru Peak at 6:12 am. My legs were jelly but the sunrise over the glacier made every step worth it. Pole pole, they kept telling us, and they were right."],
  ["see-the-northern-lights", "ingrid", "Three nights of clouds, then on the last night the whole sky turned green and purple for an hour. I forgot to take photos for the first ten minutes."],
  ["learn-to-scuba-dive", "olivia", "Got my open water certificate! First dive at 18 m and a turtle swam right past my mask. Already planning the advanced course."],
  ["walk-the-camino-de-santiago", "marta", "800 km, 34 days, two pairs of socks worn through. The best part was the people I walked with, from six countries."],
  ["hike-the-inca-trail", "diego", "Four days on the Inca Trail, then through the Sun Gate just as the fog lifted off Machu Picchu. Unreal."],
  ["learn-to-surf", "lucas", "Stood up on my fourth wave and rode it all the way in. Fell off the next twenty, but who's counting."],
  ["safari-in-the-serengeti", "grace", "Saw a leopard drag its dinner up a tree in the Maasai Mara. Our guide had been tracking it since dawn."],
  ["run-a-marathon", "rahul", "Finished in 4:31. Hit the wall at 32 km and a stranger handed me orange slices. Thank you, whoever you are."],
  ["learn-tango-in-buenos-aires", "sofia", "Six weeks of classes and my first milonga in San Telmo. I stepped on exactly one foot."],
  ["see-cherry-blossoms-in-japan", "kenji", "Philosopher's Path at 6 am, petals everywhere and nobody else around. Worth the early start."],
  ["go-skydiving", "liam", "4,000 m over the coast. The first five seconds I couldn't breathe, then it was the calmest I've ever felt."],
  ["swim-with-whale-sharks", "tom", "A whale shark the size of a bus, gliding under us like we weren't there. We kept the 3 m distance, promise."],
];

const COMMENTS = [
  "This is on my list too!",
  "Amazing, congratulations!",
  "How long did you plan for this?",
  "The photos in my head from reading this are incredible.",
  "Saving this for next year.",
  "Did you go with a group or solo?",
];

// Finished groups: their stories show as group memories.
const GROUPS = [
  ["climb-mount-kilimanjaro", "Kili sunrise crew", ["ama", "zanele", "grace", "noah"]],
  ["walk-the-camino-de-santiago", "Camino Francés, spring", ["marta", "camille", "lucia", "jonas"]],
  ["safari-in-the-serengeti", "Maasai Mara week", ["grace", "aisha", "olivia"]],
  ["see-the-northern-lights", "Tromsø aurora chasers", ["ingrid", "mei", "hana"]],
];

// ---------------------------------------------------------------------------

const existing = new Map((await demoUsers()).map((u) => [u.email, u.id]));
const ids = {};
for (const [name, handle, city, country, languages, interests] of PEOPLE) {
  const email = `${handle}@${DEMO_DOMAIN}`;
  let id = existing.get(email);
  if (!id) {
    const user = await call("/auth/v1/admin/users", {
      method: "POST",
      body: { email, email_confirm: true, user_metadata: { display_name: name, adult_confirmed: true, demo: true } },
    });
    id = user.id;
  }
  ids[handle] = id;
  // Hide from matching first, so adding items below never notifies real people.
  await rest("profile_settings?on_conflict=user_id", {
    method: "POST",
    body: { user_id: id, hide_from_matching: true },
    prefer: "resolution=merge-duplicates",
  });
  await rest(`profiles?id=eq.${id}`, {
    method: "PATCH",
    body: {
      username: `${handle}_demo`,
      display_name: name,
      bio: "Example profile, shown so you can see how the app works.",
      home_city: city,
      home_country: country,
      languages,
      interests: interests.filter((i) => ALLOWED_INTERESTS.has(i)),
      onboarded_at: new Date().toISOString(),
    },
  });
}

const goals = new Map(
  (await rest(`goals?select=id,slug&status=eq.active&slug=in.(${WANTS.join(",")})`)).map((g) => [g.slug, g.id]),
);
const handles = Object.keys(ids);

// Each person wants 3–5 goals (deterministic, so re-runs add nothing new).
const items = [];
handles.forEach((h, i) => {
  const count = 3 + (i % 3);
  for (let k = 0; k < count; k++) {
    const slug = WANTS[(i * 3 + k * 5) % WANTS.length];
    if (goals.has(slug)) items.push({ owner_id: ids[h], goal_id: goals.get(slug), title: slug.replace(/-/g, " "), status: "dreaming" });
  }
});
// Story authors have done their goal.
for (const [slug, h] of STORIES) {
  if (goals.has(slug)) items.push({ owner_id: ids[h], goal_id: goals.get(slug), title: slug.replace(/-/g, " "), status: "done" });
}
const already = new Set(
  (await rest(`bucket_items?select=owner_id,goal_id&owner_id=in.(${Object.values(ids).join(",")})`)).map((r) => `${r.owner_id}:${r.goal_id}`),
);
const toAdd = [...new Map(items.map((it) => [`${it.owner_id}:${it.goal_id}`, it])).values()].filter(
  (it) => !already.has(`${it.owner_id}:${it.goal_id}`),
);
if (toAdd.length) await rest("bucket_items", { method: "POST", body: toAdd });

// Finished groups with their members.
const groupIds = {};
for (const [slug, name, members] of GROUPS) {
  if (!goals.has(slug)) continue;
  let [group] = await rest(`groups?select=id&name=eq.${encodeURIComponent(name)}&owner_id=eq.${ids[members[0]]}`);
  if (!group) {
    [group] = await rest("groups", {
      method: "POST",
      body: { goal_id: goals.get(slug), owner_id: ids[members[0]], name, max_size: 6, join_policy: "request" },
      prefer: "return=representation",
    });
  }
  await rest("group_members?on_conflict=group_id,user_id", {
    method: "POST",
    body: members.map((m, i) => ({ group_id: group.id, user_id: ids[m], role: i === 0 ? "owner" : "member" })),
    prefer: "resolution=ignore-duplicates",
  });
  await rest(`groups?id=eq.${group.id}`, { method: "PATCH", body: { status: "completed", completed_at: new Date().toISOString() } });
  groupIds[slug] = group.id;
}

// Stories, spread over the last few weeks, then comments and reactions.
const KINDS = ["love", "fire", "inspired", "congrats"];
let storyCount = 0;
for (const [i, [slug, h, body]] of STORIES.entries()) {
  if (!goals.has(slug)) continue;
  let [story] = await rest(`stories?select=id&author_id=eq.${ids[h]}&goal_id=eq.${goals.get(slug)}`);
  if (!story) {
    const created = new Date(Date.now() - (i * 2 + 1) * 86400000).toISOString();
    [story] = await rest("stories", {
      method: "POST",
      body: { author_id: ids[h], goal_id: goals.get(slug), group_id: groupIds[slug] ?? null, body, created_at: created },
      prefer: "return=representation",
    });
    storyCount++;
    const commenters = [handles[(i + 5) % handles.length], handles[(i + 11) % handles.length]];
    await rest("story_comments", {
      method: "POST",
      body: commenters.map((c, k) => ({ story_id: story.id, author_id: ids[c], body: COMMENTS[(i + k) % COMMENTS.length] })),
    });
    const reactors = handles.filter((_, k) => (k + i) % 3 === 0).slice(0, 4 + (i % 5));
    await rest("story_reactions?on_conflict=story_id,user_id,kind", {
      method: "POST",
      body: reactors.map((r, k) => ({ story_id: story.id, user_id: ids[r], kind: KINDS[(i + k) % KINDS.length] })),
      prefer: "resolution=ignore-duplicates",
    });
  }
}

console.log(
  `Demo data ready: ${handles.length} people, ${toAdd.length} new list items, ${Object.keys(groupIds).length} groups, ${storyCount} new stories.`,
);
if (goals.size < WANTS.length) console.log(`Note: ${WANTS.length - goals.size} goal slugs weren't found and were skipped.`);
