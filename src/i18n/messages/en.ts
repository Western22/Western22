/**
 * English UI strings. This file defines the shape every other locale must
 * match (see `Messages` below), so a missing translation is a type error.
 */
const en = {
  app: {
    // TODO(brand): the product name is still a placeholder.
    name: "Buddies",
    tagline: "Share your bucket list. Find people to do it with.",
  },
  nav: {
    explore: "Explore",
    myList: "My list",
    profile: "Profile",
    signIn: "Sign in",
    signUp: "Join",
    signOut: "Sign out",
  },
  home: {
    heroTitle: "Your bucket list is better with company",
    heroBody:
      "Add the things you've always wanted to do, from climbing Kilimanjaro to learning tango in Buenos Aires, and meet people around the world who want to do them too.",
    ctaStart: "Start your list",
    ctaExplore: "See what people dream about",
    steps: {
      add: "Add a goal",
      match: "Meet people who share it",
      plan: "Plan it together",
      share: "Do it and inspire others",
    },
  },
  auth: {
    signInTitle: "Welcome back",
    signUpTitle: "Create your account",
    email: "Email",
    password: "Password",
    displayName: "Your name",
    submitSignIn: "Sign in",
    submitSignUp: "Create account",
    noAccount: "New here?",
    haveAccount: "Already have an account?",
    checkEmail: "Check your email for a link to confirm your account.",
    confirmFailed: "That link is invalid or has expired. Please try signing in again.",
  },
  profile: {
    title: "Your profile",
    username: "Username",
    usernameHint: "3 to 30 characters: lowercase letters, numbers and underscores.",
    displayName: "Display name",
    bio: "About you",
    homeCity: "Home city",
    homeCountry: "Country code",
    homeCountryHint: "Two letters, like GH, BR or JP.",
    save: "Save profile",
    saved: "Profile saved.",
    locationTitle: "Your location",
    locationBody:
      "Used later to find people near you. Your exact location is private: nobody else can see it, ever.",
    locationShare: "Use my current location",
    locationUpdate: "Update my location",
    locationSaved: "Location saved privately.",
    locationNone: "No location saved yet.",
    locationUnsupported: "Your browser can't share a location.",
    locationDenied: "Location permission was denied.",
  },
  items: {
    title: "My bucket list",
    empty: "Nothing here yet. What have you always wanted to do?",
    newTitle: "Add a goal",
    fieldTitle: "Goal",
    fieldTitlePlaceholder: "See the northern lights",
    fieldDescription: "Details (optional)",
    fieldCategory: "Category",
    fieldPlace: "Where (optional)",
    fieldPlacePlaceholder: "Tromsø, Norway",
    fieldVisibility: "Who can see it",
    add: "Add to my list",
    delete: "Delete",
    markDone: "Mark done",
    markDreaming: "Not done yet",
    visibility: { public: "Everyone", private: "Only me" },
    status: { dreaming: "Dreaming", planning: "Planning", done: "Done" },
    category: {
      adventure: "Adventure",
      travel: "Travel",
      learning: "Learning",
      creative: "Creative",
      sport: "Sport",
      food: "Food",
      nature: "Nature",
      culture: "Culture",
      social: "Social",
      other: "Other",
    },
  },
  explore: {
    title: "Explore bucket lists",
    subtitle: "Goals people around the world want to do.",
    empty: "No public goals yet. Be the first!",
    by: "by",
    anonymous: "someone",
  },
  common: {
    loading: "Loading…",
  },
  errors: {
    generic: "Something went wrong. Please try again.",
    invalidInput: "Please check the highlighted fields.",
    invalidCredentials: "Email or password is incorrect.",
    emailTaken: "An account with this email already exists.",
    weakPassword: "Password must be at least 8 characters.",
    usernameTaken: "That username is taken.",
    notSignedIn: "Please sign in first.",
  },
};

/** Recursively widen string literals so other locales can supply their own text. */
type DeepStringify<T> = { [K in keyof T]: T[K] extends string ? string : DeepStringify<T[K]> };

export type Messages = DeepStringify<typeof en>;
export type ErrorKey = keyof Messages["errors"];

export default en satisfies Messages;
