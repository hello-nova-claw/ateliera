import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

// The Reflection Garden as a real room: its notes are read from the vault through
// the Rust core (VaultStore). The Studio folder is a user-picked, security-scoped
// iCloud folder via the native `.fileImporter`, or a seeded fixture in the sim.
struct RootView: View {
  let themeStore: ThemeStore
  @Environment(\.studioTheme) private var theme
  @State private var store: VaultStore
  @State private var giftStore: GiftStore
  @State private var picking = false

  init(themeStore: ThemeStore = ThemeStore()) {
    self.themeStore = themeStore
    // One VaultStore, shared by the room lists and the Foyer's Gift, so a graded
    // card's write is reflected in both without a second load.
    let vault = VaultStore()
    _store = State(initialValue: vault)
    _giftStore = State(initialValue: GiftStore(store: vault))
    _microSeasons = State(
      initialValue: MicroSeasonStore(store: vault, personalizer: Self.makePersonalizer()))
  }

  // The production personalizer is the on-device model; UI tests inject a deterministic fake
  // so the personalised path is exercisable without the real model.
  private static func makePersonalizer() -> MicroSeasonPersonalizer {
    if ProcessInfo.processInfo.environment["ATELIERA_UITEST_AI"] == "1" {
      return FakeMicroSeasonPersonalizer()
    }
    return FoundationModelsPersonalizer()
  }

  @State private var activeSheet: ActiveSheet?
  @State private var health = HealthCycleSource()
  @State private var cycle: CycleProfile?
  @State private var location = LocationHemisphere()
  @State private var hemisphere: Hemisphere = SharedStore.bestHemisphere
  @State private var profileStore = RhythmProfileStore()
  @State private var homePlace = HomePlaceStore()  // where you live, for climate personalisation
  @State private var microSeasons: MicroSeasonStore  // the on-device personalised micro-season
  @State private var showToday = false  // the atmosphere panel starts tucked away
  @State private var navigateRoute: RoomRoute?  // an accepted invitation that opens a room
  @State private var pendingSeed: WorkshopSeed?  // set on capture; becomes the offer once the sheet closes
  @State private var workshopOffer: WorkshopSeed?  // a gentle, dismissable "develop this" offer
  @State private var workshopSeed: WorkshopSeed?  // drives the workshop sheet (once accepted)
  @State private var pendingBecoming: WorkshopSeed?  // a Life-planning capture; opens the thread on dismiss
  @State private var pendingGuided: GuidedSeed?  // a gratitude/dream capture; opens its thread on dismiss
  @State private var activeGuided: GuidedSeed?  // drives the gratitude/dream guided-thread sheet
  @State private var pendingReverse: WorkshopSeed?  // a Possibility to work forward; opens on dismiss

  // A just-captured gratitude/dream entry to deepen with its guided follow-up prompts.
  struct GuidedSeed: Identifiable {
    let id = UUID()
    let path: String
    let text: String
    let kind: GuidedThreadKind
  }

  struct RoomRoute: Identifiable, Hashable { let id: String }
  // A just-captured entry to workshop (anchor to an area, then walk the dimensions).
  // `mode` distinguishes a becoming statement (guided, prompts carry its words) from
  // developing an ordinary note.
  struct WorkshopSeed: Identifiable {
    let id = UUID()
    let path: String
    let text: String
    var mode: WorkshopView.Mode = .develop
  }

  // One sheet at a time: a fresh capture, an edit, or the rhythm profile.
  private enum ActiveSheet: Identifiable {
    case capture(room: String?, keep: Bool)
    case edit(EditableNote)
    case rhythm
    case search
    case settings
    case placement
    case tour
    case moonIntention(lunation: String)
    case reflect

    var id: String {
      switch self {
      case .capture(let room, let keep): return "capture:\(room ?? "inbox"):\(keep ? "keep" : "draft")"
      case .edit(let editable): return "edit:\(editable.id)"
      case .rhythm: return "rhythm"
      case .search: return "search"
      case .settings: return "settings"
      case .placement: return "placement"
      case .tour: return "tour"
      case .moonIntention(let lunation): return "moon:\(lunation)"
      case .reflect: return "reflect"
      }
    }
  }

  // Today's rhythm. Hemisphere comes from the device's location (persisted across
  // launches); the cycle from HealthKit. Moon and felt season need neither.
  private var almanacContext: RhythmContext {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = .current
    formatter.dateFormat = "yyyy-MM-dd"
    let today = formatter.string(from: Date())
    return Rhythm.computeContext(
      profile: RhythmProfile(hemisphere: hemisphere, cycle: cycle), date: today)
  }

  // Recompute today's personalised micro-season (served from cache or generated once per
  // window when the on-device model is available and enabled; deterministic otherwise).
  private func refreshMicroSeason() async {
    await microSeasons.refresh(
      context: almanacContext, home: homePlace.place,
      enabled: store.preferences.rhythm.resolvedPersonalizeMicroSeasons)
  }

  // The single, contextual invitation to offer beside the Gift (or none).
  private var currentInvitation: Invitation? {
    InvitationEngine.current(
      InvitationContext(
        date: almanacContext.date, hemisphere: hemisphere, notes: store.parsedNotes,
        cycle: cycle, birthDate: profileStore.birth?.date,
        dismissed: store.dismissedInvitations))
  }

  private func accept(_ invitation: Invitation) {
    switch invitation.kind {
    case .newMoonIntention(let lunation): activeSheet = .moonIntention(lunation: lunation)
    case .fullMoonReflection, .microSeasonShift, .cyclePhase: activeSheet = .reflect
    case .seasonAtTurningPoint, .seasonClosing, .solarReturn:
      navigateRoute = RoomRoute(id: "current-season")
    case .inboxWaiting: navigateRoute = RoomRoute(id: "inbox")
    case .synthesizeWisdom: navigateRoute = RoomRoute(id: "wisdom-garden")
    case .promoteIdentity: navigateRoute = RoomRoute(id: "identity-studio")
    }
    store.dismissInvitation(invitation.id)  // accepting also retires this occurrence
  }

  @ViewBuilder
  private func roomDestination(byId id: String) -> some View {
    if let room = Room.all.first(where: { $0.id == id }) { roomDestination(room) }
  }

  // Three calm tabs give the app a spine: Today (a greeting + one gentle daily
  // card + capture), Rooms (the directory + what you've captured lately), and Find.
  // No more one-long-scroll home you must return to in order to go anywhere.
  var body: some View {
    TabView {
      todayTab
        .tabItem { Label("Today", systemImage: "sun.max") }
      roomsTab
        .tabItem { Label("Browse", systemImage: "square.grid.2x2") }
      findTab
        .tabItem { Label("Find", systemImage: "magnifyingglass") }
    }
    .tint(theme.link)
    .overlay(alignment: .bottom) {
      if let offer = workshopOffer { developOffer(offer) }
    }
    .fileImporter(
      isPresented: $picking, allowedContentTypes: [.folder], allowsMultipleSelection: false
    ) { result in
      if case .success(let urls) = result, let url = urls.first {
        store.open(url: url)
      }
    }
    .task {
      // First launch with no chosen vault: guide the person straight to the folder
      // picker rather than an empty Foyer. (In the simulator a demo vault is seeded,
      // so this only fires on a real, un-onboarded device.)
      if !store.hasVault { picking = true }
      // Resolve the home place (hemisphere + a reverse-geocoded place for climate) first,
      // then the cycle from HealthKit — sequentially so the permission prompts don't stack.
      // Both refine the almanac and both degrade quietly when unavailable.
      if let resolved = await location.resolveHome() {
        hemisphere = resolved.latitude >= 0 ? .north : .south
        if homePlace.place == nil { homePlace.set(resolved) }  // seed once; Settings can override
      }
      cycle = await health.loadCycle()
      giftStore.refresh(ctx: almanacContext, today: almanacContext.date)
      // UI tests can't reach Location, so seed a home place to exercise the personalised path.
      if ProcessInfo.processInfo.environment["ATELIERA_UITEST_AI"] == "1", homePlace.place == nil {
        homePlace.set(ResolvedPlace(name: "Testville", latitude: -37.8, longitude: 144.9, timeZoneId: nil))
      }
      await refreshMicroSeason()
      if store.seededNewStudio, !OnboardingStore().hasSeenTour(studioId: store.studioId),
        activeSheet == nil
      {
        activeSheet = .tour
      }
    }
    .onChange(of: almanacContext.date) {
      giftStore.refresh(ctx: almanacContext, today: almanacContext.date)
      Task { await refreshMicroSeason() }
    }
    .onChange(of: store.preferences.rhythm.personalizeMicroSeasons) {
      Task { await refreshMicroSeason() }
    }
    .onChange(of: homePlace.place) {
      Task { await refreshMicroSeason() }
    }
    .sheet(item: $workshopSeed) { seed in
      WorkshopView(
        store: store, seedPath: seed.path, seedText: seed.text, mode: seed.mode,
        onClose: { workshopSeed = nil })
      .studioTheme(themeStore.current)
    }
    .sheet(
      item: $activeGuided,
      // Working a Possibility forward opens the reverse workshop once the guided thread
      // sheet has dismissed (one sheet at a time).
      onDismiss: {
        if let reverse = pendingReverse {
          pendingReverse = nil
          workshopSeed = reverse
        }
      }
    ) { seed in
      GuidedThreadView(
        store: store, seedPath: seed.path, seedText: seed.text, kind: seed.kind,
        onClose: { activeGuided = nil },
        // A Possibility can be worked forward: close the guided thread and queue the
        // reverse Landscape workshop on the same seed (opens once this sheet dismisses).
        onWorkshopForward: seed.kind == .possibilities
          ? {
            pendingReverse = WorkshopSeed(path: seed.path, text: seed.text, mode: .possibility)
            activeGuided = nil
          }
          : nil)
      .studioTheme(themeStore.current)
    }
    .sheet(
      item: $activeSheet,
      // A quick Journal capture offers to develop the note on the Landscape — a calm,
      // dismissable prompt (never a forced flow), shown once the capture sheet closes.
      // A Life-planning capture instead opens the guided Become thread straight away.
      onDismiss: {
        if let seed = pendingSeed {
          pendingSeed = nil
          withAnimation(.easeInOut(duration: 0.2)) { workshopOffer = seed }
        }
        if let becoming = pendingBecoming {
          pendingBecoming = nil
          workshopSeed = becoming
        }
        if let guided = pendingGuided {
          pendingGuided = nil
          activeGuided = guided
        }
      }
    ) { sheet in
      switch sheet {
      case .capture(let room, let keep):
        NoteEditorSheet(
          heading: "Capture", confirmLabel: "Keep", initialTitle: "", initialBody: "",
          showsExtras: true,
          onSave: { title, body, tags, cover in
            let ok = store.capture(
              title: title, body: body, room: room ?? "inbox", tags: tags, coverData: cover,
              keep: keep)
            // Only Inbox/Journal entries (the `inbox` room) expand into a workshop.
            if ok, (room ?? "inbox") == "inbox", let path = store.lastCapturedPath {
              pendingSeed = WorkshopSeed(path: path, text: body)
            }
            return ok
          },
          onClose: { activeSheet = nil })
      case .edit(let editable):
        NoteEditView(
          store: store, editable: editable, onClose: { activeSheet = nil },
          onNavigate: { target in navigateWikilink(target) },
          onOpenPath: { path in
            if let next = store.beginEdit(path: path) { activeSheet = .edit(next) }
          })
      case .rhythm:
        RhythmSettingsView(
          store: profileStore, isPresented: Binding(get: { activeSheet != nil }, set: { if !$0 { activeSheet = nil } }))
      case .search:
        SearchView(
          store: store,
          onOpen: { path in
            if let editable = store.beginEdit(path: path) { activeSheet = .edit(editable) }
          },
          onClose: { activeSheet = nil })
      case .settings:
        SettingsView(
          themeStore: themeStore, store: store, homePlace: homePlace, location: location,
          onClose: { activeSheet = nil },
          onReplayTour: { activeSheet = .tour },
          onChangeFolder: { activeSheet = nil; picking = true }
        )
        .studioTheme(themeStore.current)
      case .placement:
        ClassifiedCaptureSheet(
          store: store,
          onStartThread: { path, text in
            pendingBecoming = WorkshopSeed(path: path, text: text, mode: .becoming)
          },
          onStartGuided: { kind, path, text in
            pendingGuided = GuidedSeed(path: path, text: text, kind: kind)
          },
          onClose: { activeSheet = nil })
      case .tour:
        FirstVisitGuide(onFinish: {
          OnboardingStore().markTourSeen(studioId: store.studioId)
          activeSheet = nil
        })
      case .moonIntention(let lunation):
        NoteEditorSheet(
          heading: "New moon intention", confirmLabel: "Keep", initialTitle: "",
          initialBody: "",
          onSave: { _, body, _, _ in store.captureMoonIntention(body: body, lunationDate: lunation) },
          onClose: { activeSheet = nil })
      case .reflect:
        NoteEditorSheet(
          heading: "Reflect", confirmLabel: "Keep", initialTitle: "", initialBody: "",
          onSave: { title, body, _, _ in
            store.capture(
              title: title.isEmpty ? nil : title, body: body, room: "reflection-garden",
              cardType: "reflection", semanticType: "reflection")
          },
          onClose: { activeSheet = nil })
      }
    }
  }

  // TODAY — a greeting, one gentle daily card, the day's rhythm tucked away, and one
  // way to capture. Rooms and search have moved to their own tabs, so this stays calm.
  private var todayTab: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 30) {
          VStack(alignment: .leading, spacing: 30) {
            BrandLockup()
              .padding(.bottom, 2)
            HStack(alignment: .top, spacing: 12) {
              RoomHeading(eyebrow: greeting, title: "The Foyer", intro: "A calm place to begin.")
              Spacer(minLength: 0)
              ProfileAvatar(store: store, size: 48)
            }
          }
          .padding(.horizontal, 28)

          // Full-bleed seasonal hero with the Today card lifted over its lower edge.
          VStack(spacing: 0) {
            SeasonalHero(season: feltSeason, height: 230, cornerRadius: 0)
            almanacCard
              .padding(.horizontal, 28)
              .padding(.top, -44)
          }

          VStack(alignment: .leading, spacing: 30) {
            dailyCard
            captureButton
            todaySection
            if let error = store.error {
              Text(error).font(StudioFont.meta).foregroundStyle(theme.celebration)
            }
            recentlySection
          }
          .padding(.horizontal, 28)
        }
        .padding(.vertical, 28)
        .frame(maxWidth: .infinity, alignment: .leading)
      }
      .background(theme.canvas)
      .navigationDestination(item: $navigateRoute) { route in roomDestination(byId: route.id) }
      .toolbar { studioToolbar }
    }
  }

  // The daily prompt shows at most ONE thing (no more three stacked cards): the
  // resurfaced Gift when one is due, else a single contextual invitation, else the
  // Gift's calm line.
  @ViewBuilder
  private var dailyCard: some View {
    if giftIsDue {
      giftView
    } else if let invitation = currentInvitation {
      InvitationCard(
        invitation: invitation,
        onAccept: { accept(invitation) },
        onDismiss: { store.dismissInvitation(invitation.id) })
    } else {
      giftView
    }
  }

  private var giftView: some View {
    TodaysGiftView(store: giftStore) { quality in
      giftStore.grade(quality, today: almanacContext.date)
    }
  }

  // The felt season for the Foyer's hero photo, from the person's own season style.
  private var feltSeason: Season {
    Rhythm.season(
      date: almanacContext.date, hemisphere: hemisphere,
      style: store.preferences.rhythm.resolvedSeasonStyle)
  }

  // The day's rhythm as a calm, prominent card — the Foyer's quiet centrepiece.
  @ViewBuilder
  private var almanacCard: some View {
    if Preferences.isFoyerSectionVisible("almanac", store.preferences) {
      AlmanacView(
        context: almanacContext, hemisphere: hemisphere,
        seasonStyle: store.preferences.rhythm.resolvedSeasonStyle,
        personalizedMicroSeason: microSeasons.personalized,
        personalizedPlace: microSeasons.personalizedPlace)
        .studioCard()
    }
  }

  // The single way in: one calm, guided capture. Rooms live in the Browse tab, so Today
  // stays a place to begin rather than a directory to scan.
  private var captureButton: some View {
    Button {
      activeSheet = .placement
    } label: {
      HStack(spacing: 10) {
        Image(systemName: "plus.circle.fill").font(.system(size: 18))
        Text("Capture something").font(StudioFont.control)
      }
      .foregroundStyle(theme.canvas)
      .frame(maxWidth: .infinity, minHeight: 54)
      .background(RoundedRectangle(cornerRadius: 14).fill(theme.inkStrong))
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityIdentifier("capture-button")
  }

  private var giftIsDue: Bool {
    if case .card = giftStore.gift { return true }
    return false
  }

  private var greeting: String {
    let base: String
    switch Calendar.current.component(.hour, from: Date()) {
    case 5..<12: base = "good morning"
    case 12..<17: base = "good afternoon"
    case 17..<22: base = "good evening"
    default: base = "welcome back"
    }
    // Address you by name once a profile exists; otherwise keep the quiet lowercase line.
    guard let name = store.profileName else { return base }
    return "\(base.prefix(1).uppercased())\(base.dropFirst()), \(name)"
  }

  // ROOMS — the directory of rooms and everything you've captured lately, off the
  // Today surface so neither list makes the home grow without end.
  private var roomsTab: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 28) {
          RoomHeading(
            eyebrow: "your studio", title: "Browse",
            intro: "Everything you've made — step into a room to work in it.")
          roomsSection
        }
        .padding(28)
        .frame(maxWidth: .infinity, alignment: .leading)
      }
      .background(theme.canvas)
    }
  }

  // FIND — faceted search hosted directly in the tab (no Done button here).
  private var findTab: some View {
    SearchView(store: store, onOpen: openPath, onClose: nil)
  }

  // A calm, dismissable offer to open the workshop on a just-captured note. It sits above
  // the tab bar, never blocks, and clears when tapped or dismissed — quick jots stay quick.
  private func developOffer(_ seed: WorkshopSeed) -> some View {
    HStack(spacing: 12) {
      Button {
        withAnimation(.easeInOut(duration: 0.2)) { workshopOffer = nil }
        workshopSeed = seed
      } label: {
        HStack(spacing: 8) {
          Image(systemName: "sparkle").font(.system(size: 12))
          Text("Develop this on your Landscape").font(StudioFont.control)
          Image(systemName: "arrow.right").font(.system(size: 11))
        }
        .foregroundStyle(theme.link)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityIdentifier("develop-offer")
      Spacer(minLength: 0)
      Button {
        withAnimation(.easeInOut(duration: 0.2)) { workshopOffer = nil }
      } label: {
        Image(systemName: "xmark").font(.system(size: 11)).foregroundStyle(theme.inkFaint)
      }
      .buttonStyle(.plain)
      .accessibilityIdentifier("develop-offer-dismiss")
    }
    .padding(.horizontal, 16).padding(.vertical, 12)
    .background(RoundedRectangle(cornerRadius: 12).fill(theme.surface))
    .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(theme.line, lineWidth: 1))
    .padding(.horizontal, 20).padding(.bottom, 58)
    .transition(.move(edge: .bottom).combined(with: .opacity))
  }

  @ToolbarContentBuilder
  private var studioToolbar: some ToolbarContent {
    ToolbarItem(placement: .primaryAction) {
      Button {
        activeSheet = .settings
      } label: {
        Image(systemName: "gearshape").font(StudioFont.control)
      }
      .foregroundStyle(theme.link)
      .accessibilityIdentifier("settings-button")
      .accessibilityLabel("Settings")
    }
  }

  private func openEdit(_ note: NoteSummary) {
    if let editable = store.beginEdit(path: note.id) { activeSheet = .edit(editable) }
  }

  // Resolve a wikilink target to a note and open it; returns false (caller shows
  // "not found") when it can't be resolved.
  private func navigateWikilink(_ target: String) -> Bool {
    guard let path = WikilinkNavigator.resolvePath(target: target, in: store.liveNotes),
      let editable = store.beginEdit(path: path)
    else { return false }
    activeSheet = .edit(editable)
    return true
  }

  // A tuck-away "Today" panel: the day's rhythm almanac, who you're becoming, the
  // feelings and principles you're holding, and the rhythm setup link. Collapsed by
  // default so the Foyer stays calm; one tap slides it open.
  @ViewBuilder
  private var todaySection: some View {
    VStack(alignment: .leading, spacing: 18) {
      Button {
        withAnimation(.easeInOut(duration: 0.25)) { showToday.toggle() }
      } label: {
        HStack {
          Text("Today's rhythm & intentions")
            .font(StudioFont.control).foregroundStyle(theme.inkStrong)
          Spacer()
          Image(systemName: showToday ? "chevron.up" : "chevron.down")
            .font(.system(size: 12)).foregroundStyle(theme.inkFaint)
        }
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityIdentifier("today-panel-toggle")

      if showToday {
        if Preferences.isFoyerSectionVisible("almanac", store.preferences) {
          AlmanacView(
            context: almanacContext, hemisphere: hemisphere,
            seasonStyle: store.preferences.rhythm.resolvedSeasonStyle, mode: .detail,
            personalizedMicroSeason: microSeasons.personalized,
            personalizedPlace: microSeasons.personalizedPlace)
        }
        FoyerRichView(store: store, onOpen: openPath)
        Button {
          activeSheet = .rhythm
        } label: {
          Text("Your rhythm ›").font(StudioFont.control).foregroundStyle(theme.link)
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("rhythm-button")
      }
    }
    .padding(16)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(RoundedRectangle(cornerRadius: 12).fill(theme.surface))
    .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(theme.line, lineWidth: 1))
  }

  // The rooms you can step into, each with how many notes it holds.
  private var roomsSection: some View {
    VStack(alignment: .leading, spacing: 0) {
      Text("ROOMS")
        .font(StudioFont.eyebrow).tracking(1.6).foregroundStyle(theme.inkFaint)
        .padding(.bottom, 8)
      ForEach(Room.all.filter { Preferences.isRoomVisible($0.id, store.preferences) }) { room in
        NavigationLink {
          roomDestination(room)
        } label: {
          HStack(spacing: 10) {
            Text(room.title).font(StudioFont.cardTitle).foregroundStyle(theme.inkStrong)
            Spacer(minLength: 0)
            let count = store.liveNotes.filter { room.matches(rooms: $0.rooms, status: $0.status) }.count
            if count > 0 {
              Text("\(count)").font(StudioFont.meta).foregroundStyle(theme.inkMuted)
            }
            Image(systemName: "chevron.right")
              .font(.system(size: 12)).foregroundStyle(theme.inkFaint)
          }
          .padding(.vertical, 14)
        }
        .accessibilityIdentifier("room-\(room.id)")
        Divider().overlay(theme.line)
      }
    }
  }

  // Life Landscape and Identity Studio are projected rooms with their own stores;
  // every other room is the generic note-list RoomView.
  @ViewBuilder
  private func roomDestination(_ room: Room) -> some View {
    switch room.id {
    case "inbox":
      InboxView(
        room: room, store: store, onOpen: openPath,
        onCapture: { activeSheet = .capture(room: room.vaultKey, keep: false) })
    case "journal":
      JournalView(
        room: room, store: store, onOpen: openPath,
        onCapture: { activeSheet = .capture(room: room.vaultKey, keep: true) })
    case "landscape":
      LandscapeRoomView(store: store, onOpen: openPath)
    case "identity-studio":
      IdentityRoomView(store: store, onOpen: openPath)
    case "uncharted":
      UnchartedView(store: store, onOpen: openPath)
    case "wisdom-garden":
      WisdomView(store: store, onOpen: openPath)
    case "reflection-garden":
      ReflectionView(store: store, onOpen: openPath)
    case "current-season":
      SeasonView(
        store: store, hemisphere: hemisphere,
        seasonStyle: store.preferences.rhythm.resolvedSeasonStyle,
        personalizedMicroSeason: microSeasons.personalized,
        personalizedPlace: microSeasons.personalizedPlace, onOpen: openPath)
    default:
      RoomView(
        room: room, store: store, onOpen: openEdit,
        onCapture: { activeSheet = .capture(room: room.vaultKey, keep: false) })
    }
  }

  private func openPath(_ path: String) {
    if let editable = store.beginEdit(path: path) { activeSheet = .edit(editable) }
  }

  // Everything you've captured, newest first, whatever room it's in.
  // A short, capped "Recently" on the Today tab: enough to confirm a fresh capture
  // landed and to pick up where you left off, without the home growing without end.
  // Older notes live in their rooms and are reachable through Find.
  private var recentlySection: some View {
    let recent = Array(store.liveNotes.prefix(6))
    return VStack(alignment: .leading, spacing: 0) {
      if !recent.isEmpty {
        Text("RECENTLY")
          .font(StudioFont.eyebrow).tracking(1.6).foregroundStyle(theme.inkFaint)
          .padding(.bottom, 8)
      }
      ForEach(recent) { note in
        Button { openEdit(note) } label: { NoteRow(note: note) }
          .buttonStyle(.plain)
        Divider().overlay(theme.line)
      }
      if store.liveNotes.count > recent.count {
        Text("Older notes live in their rooms — or find any of them in Find.")
          .font(StudioFont.meta).foregroundStyle(theme.inkFaint)
          .padding(.top, 10)
      }
    }
  }

}

// A note as it appears in a list: a meaning-coloured mark, title, and snippet.
private struct NoteRow: View {
  @Environment(\.studioTheme) private var theme
  let note: NoteSummary

  var body: some View {
    HStack(alignment: .top, spacing: 14) {
      Image(systemName: "heart.fill")
        .font(.system(size: 12))
        .foregroundStyle(meaningColour(note.meaning, theme: theme))
        .padding(.top, 5)
      VStack(alignment: .leading, spacing: 4) {
        Text(note.title)
          .font(StudioFont.cardTitle)
          .foregroundStyle(theme.inkStrong)
        if !note.snippet.isEmpty {
          Text(note.snippet)
            .font(StudioFont.meta)
            .foregroundStyle(theme.inkMuted)
            .fixedSize(horizontal: false, vertical: true)
        }
      }
      Spacer(minLength: 0)
    }
    .padding(.vertical, 14)
  }
}

// A single room: its heading and the notes tagged to it. Tap a note to edit; swipe it
// left for the nudge bar (File to another room · Delete).
private struct RoomView: View {
  @Environment(\.studioTheme) private var theme
  let room: Room
  let store: VaultStore
  let onOpen: (NoteSummary) -> Void
  let onCapture: () -> Void
  @State private var filing: NoteSummary?

  private var notes: [NoteSummary] {
    store.liveNotes.filter { room.matches(rooms: $0.rooms, status: $0.status) }
  }

  var body: some View {
    List {
      Section {
        RoomHeading(eyebrow: room.eyebrow, title: room.title, intro: room.intro)
        Button(action: onCapture) {
          Label("Add to \(room.title)", systemImage: "plus.circle.fill")
            .font(StudioFont.control)
            .foregroundStyle(theme.link)
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("room-capture-button")
      }
      .studioRoomRow(EdgeInsets(top: 12, leading: 28, bottom: 6, trailing: 28))

      if notes.isEmpty {
        Text("Nothing here yet.")
          .font(StudioFont.meta).foregroundStyle(theme.inkFaint)
          .studioRoomRow(EdgeInsets(top: 6, leading: 28, bottom: 6, trailing: 28))
      } else {
        ForEach(notes) { note in
          Button { onOpen(note) } label: { NoteRow(note: note) }
            .buttonStyle(.plain)
            .studioRoomRow(EdgeInsets(top: 2, leading: 28, bottom: 2, trailing: 28))
            .accessibilityIdentifier("note-row-\(note.id)")
            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
              Button(role: .destructive) {
                _ = store.setNoteStatus(path: note.id, status: "trashed")
              } label: { Label("Delete", systemImage: "trash") }
              Button { filing = note } label: { Label("File…", systemImage: "tray.and.arrow.down") }
                .tint(theme.link)
            }
        }
      }
    }
    .studioRoomList(theme.canvas)
    .navigationTitle(room.title)
    .confirmationDialog(
      "File to…",
      isPresented: Binding(get: { filing != nil }, set: { if !$0 { filing = nil } }),
      presenting: filing
    ) { note in
      ForEach(Room.all.filter { $0.id != room.id }) { target in
        Button(target.title) { _ = store.fileNote(path: note.id, toRoom: target.id) }
      }
      Button("Cancel", role: .cancel) {}
    }
  }
}

func meaningColour(_ meaning: String, theme: StudioTheme) -> Color {
  switch meaning {
  case "foundation", "foundations": return theme.foundation
  case "vision": return theme.vision
  case "growth": return theme.growth
  case "celebration": return theme.celebration
  case "uncharted": return theme.uncharted
  default: return theme.reflection
  }
}

struct RoomHeading: View {
  @Environment(\.studioTheme) private var theme
  let eyebrow: String
  let title: String
  let intro: String

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text(eyebrow)
        .font(StudioFont.displayItalic(19))
        .foregroundStyle(theme.script)
      Text(title)
        .font(StudioFont.roomTitle)
        .tracking(-0.5)
        .foregroundStyle(theme.inkStrong)
      Text(intro)
        .font(StudioFont.pageSubtitle)
        .foregroundStyle(theme.inkMuted)
        .fixedSize(horizontal: false, vertical: true)
    }
  }
}

// A circular profile picture (from the vault), or a calm placeholder when none is set.
// Shown on the Foyer beside the greeting and in Settings' Profile section.
struct ProfileAvatar: View {
  @Environment(\.studioTheme) private var theme
  let store: VaultStore
  var size: CGFloat = 48
  @State private var image: UIImage?

  var body: some View {
    Group {
      if let image {
        Image(uiImage: image).resizable().scaledToFill()
      } else {
        theme.sunken
          .overlay(
            Image(systemName: "person.crop.circle")
              .font(.system(size: size * 0.5))
              .foregroundStyle(theme.inkFaint))
      }
    }
    .frame(width: size, height: size)
    .clipShape(Circle())
    .overlay(Circle().stroke(theme.line, lineWidth: 1))
    .accessibilityIdentifier("profile-avatar")
    .task(id: store.profileChangeStamp) {
      image = store.profileAvatar().flatMap(UIImage.init)
    }
  }
}

// The note composer, shared by capture (a new note) and edit (an existing one):
// an optional title and the note body. The confirm button calls `onSave` and
// dismisses only when it returns true, so a write conflict or empty note keeps the
// sheet open with the error shown in the room behind it.
private struct NoteEditorSheet: View {
  @Environment(\.studioTheme) private var theme
  let heading: String
  let confirmLabel: String
  let showsExtras: Bool  // tags + a cover photo (the Journal capture); off for moon/reflect
  let onSave: (_ title: String, _ body: String, _ tags: [String], _ coverData: Data?) -> Bool
  let onClose: () -> Void
  @State private var noteTitle: String
  @State private var noteText: String
  @State private var tagsText = ""
  @State private var coverItem: PhotosPickerItem?
  @State private var coverData: Data?
  @State private var coverImage: UIImage?

  init(
    heading: String, confirmLabel: String, initialTitle: String, initialBody: String,
    showsExtras: Bool = false,
    onSave: @escaping (_ title: String, _ body: String, _ tags: [String], _ coverData: Data?) ->
      Bool, onClose: @escaping () -> Void
  ) {
    self.heading = heading
    self.confirmLabel = confirmLabel
    self.showsExtras = showsExtras
    self.onSave = onSave
    self.onClose = onClose
    _noteTitle = State(initialValue: initialTitle)
    _noteText = State(initialValue: initialBody)
  }

  // Comma-separated tags → a clean, de-duped list.
  private var parsedTags: [String] {
    var seen = Set<String>()
    return tagsText.split(separator: ",").compactMap {
      let t = $0.trimmingCharacters(in: .whitespaces)
      guard !t.isEmpty, seen.insert(t.lowercased()).inserted else { return nil }
      return t
    }
  }

  private var canConfirm: Bool {
    !noteText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }

  private func fieldLabel(_ text: String) -> some View {
    Text(text.uppercased())
      .font(StudioFont.eyebrow)
      .tracking(1.6)
      .foregroundStyle(theme.inkFaint)
  }

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 22) {
          VStack(alignment: .leading, spacing: 6) {
            fieldLabel("Title")
            TextField("A short name (optional)", text: $noteTitle)
              .font(StudioFont.cardTitle)
              .foregroundStyle(theme.inkStrong)
              .accessibilityIdentifier("note-title-field")
          }
          Divider().overlay(theme.line)
          VStack(alignment: .leading, spacing: 6) {
            fieldLabel("Reflection")
            ZStack(alignment: .topLeading) {
              if noteText.isEmpty {
                Text("Write what you're noticing…")
                  .font(StudioFont.pageSubtitle)
                  .foregroundStyle(theme.inkFaint)
                  .padding(.top, 8)
                  .padding(.leading, 5)
                  .allowsHitTesting(false)
              }
              TextEditor(text: $noteText)
                .font(StudioFont.pageSubtitle)
                .foregroundStyle(theme.inkStrong)
                .scrollContentBackground(.hidden)
                .frame(minHeight: 200)
                .accessibilityIdentifier("note-body-editor")
            }
          }
          if showsExtras { extrasSection }
          Text("Notice what is changing. Fifteen minutes still counts.")
            .font(StudioFont.meta)
            .foregroundStyle(theme.inkFaint)
        }
        .padding(24)
      }
      .background(theme.canvas)
      .onChange(of: coverItem) { importCover() }
      .toolbar {
        // A styled principal title instead of `.navigationTitle`, so the heading
        // is always high-contrast ink rather than a faint system default.
        ToolbarItem(placement: .principal) {
          Text(heading)
            .font(StudioFont.control)
            .foregroundStyle(theme.inkStrong)
        }
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancel") { onClose() }
        }
        ToolbarItem(placement: .confirmationAction) {
          Button(confirmLabel) {
            if onSave(noteTitle, noteText, parsedTags, coverData) { onClose() }
          }
          .disabled(!canConfirm)
          .accessibilityIdentifier("note-save-button")
        }
      }
    }
  }

  // Tags + an optional cover photo, for a richer Journal entry at capture time.
  private var extrasSection: some View {
    VStack(alignment: .leading, spacing: 16) {
      Divider().overlay(theme.line)
      VStack(alignment: .leading, spacing: 6) {
        fieldLabel("Tags")
        TextField("Comma-separated (e.g. gratitude, nature)", text: $tagsText)
          .font(StudioFont.pageSubtitle)
          .foregroundStyle(theme.inkStrong)
          .autocorrectionDisabled()
          .textInputAutocapitalization(.never)
          .accessibilityIdentifier("note-tags-field")
      }
      VStack(alignment: .leading, spacing: 8) {
        fieldLabel("Cover")
        if let coverImage {
          Image(uiImage: coverImage)
            .resizable().scaledToFill()
            .frame(maxWidth: .infinity).frame(height: 140)
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .accessibilityIdentifier("note-cover-image")
        }
        PhotosPicker(selection: $coverItem, matching: .images) {
          Label(coverData == nil ? "Add a cover image" : "Change cover image", systemImage: "photo")
            .font(StudioFont.control).foregroundStyle(theme.link)
        }
        .accessibilityIdentifier("note-cover-picker")
      }
    }
  }

  private func importCover() {
    guard let coverItem else { return }
    Task {
      guard let data = try? await coverItem.loadTransferable(type: Data.self) else { return }
      await MainActor.run {
        coverData = data
        coverImage = UIImage(data: data)
      }
    }
  }
}

// Editing an existing note: title + body, plus a "Details" screen for all
// metadata. Holds the full StudioNote and saves it through the one write rail.
private struct NoteEditView: View {
  @Environment(\.studioTheme) private var theme
  let store: VaultStore
  let editable: EditableNote
  let onClose: () -> Void
  let onNavigate: (String) -> Bool  // wikilink target → true if it navigated away
  let onOpenPath: (String) -> Void  // open another note by its vault path (backlinks)
  @State private var note: StudioNote
  @State private var titleText: String
  @State private var showingPreview = false
  @State private var notFound = false
  @State private var coverItem: PhotosPickerItem?
  @State private var coverImage: UIImage?
  @State private var recoverableDraft: DraftRecord?
  @State private var confirmingDelete = false
  @State private var linking = false
  private let recovery = DraftRecovery()

  init(
    store: VaultStore, editable: EditableNote, onClose: @escaping () -> Void,
    onNavigate: @escaping (String) -> Bool, onOpenPath: @escaping (String) -> Void
  ) {
    self.store = store
    self.editable = editable
    self.onClose = onClose
    self.onNavigate = onNavigate
    self.onOpenPath = onOpenPath
    _note = State(initialValue: editable.note)
    _titleText = State(initialValue: editable.note.title ?? "")
  }

  private var canSave: Bool {
    !note.body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 22) {
          if let draft = recoverableDraft {
            draftBanner(draft)
          }
          VStack(alignment: .leading, spacing: 6) {
            fieldLabel("Title")
            TextField("A short name (optional)", text: $titleText)
              .font(StudioFont.cardTitle).foregroundStyle(theme.inkStrong)
              .accessibilityIdentifier("note-title-field")
          }
          Divider().overlay(theme.line)
          VStack(alignment: .leading, spacing: 6) {
            HStack {
              fieldLabel("Reflection")
              Spacer()
              Button(showingPreview ? "Edit" : "Preview") { showingPreview.toggle() }
                .font(StudioFont.meta).foregroundStyle(theme.link)
                .accessibilityIdentifier("preview-toggle")
            }
            if showingPreview {
              BodyPreviewView(bodyText: note.body) { target in
                if !onNavigate(target) { notFound = true }
              }
            } else {
              TextEditor(text: $note.body)
                .font(StudioFont.pageSubtitle).foregroundStyle(theme.inkStrong)
                .scrollContentBackground(.hidden)
                .frame(minHeight: 180)
                .accessibilityIdentifier("note-body-editor")
              Button { linking = true } label: {
                Label("Link a note", systemImage: "link.badge.plus")
                  .font(StudioFont.meta).foregroundStyle(theme.link)
              }
              .buttonStyle(.plain)
              .accessibilityIdentifier("insert-link-button")
            }
          }
          Divider().overlay(theme.line)
          NavigationLink {
            MetadataEditorView(note: $note)
          } label: {
            Label("Details", systemImage: "slider.horizontal.3")
              .font(StudioFont.control).foregroundStyle(theme.link)
          }
          .accessibilityIdentifier("note-details-button")
          NavigationLink {
            BacklinksView(store: store, sourcePath: editable.path, onNavigate: onOpenPath)
          } label: {
            Label("Links", systemImage: "link")
              .font(StudioFont.control).foregroundStyle(theme.link)
          }
          .accessibilityIdentifier("note-links-button")
          coverSection
          Divider().overlay(theme.line)
          Button(role: .destructive) { confirmingDelete = true } label: {
            Label("Delete", systemImage: "trash")
              .font(StudioFont.control).foregroundStyle(theme.celebration)
          }
          .buttonStyle(.plain)
          .accessibilityIdentifier("note-delete-button")
        }
        .padding(24)
      }
      .background(theme.canvas)
      .toolbar {
        ToolbarItem(placement: .principal) {
          Text("Edit").font(StudioFont.control).foregroundStyle(theme.inkStrong)
        }
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancel") { onClose() }
        }
        ToolbarItem(placement: .confirmationAction) {
          Button("Save") {
            let trimmed = titleText.trimmingCharacters(in: .whitespacesAndNewlines)
            note.title = trimmed.isEmpty ? nil : trimmed
            if store.saveEdit(editable, updatedNote: note) {
              recovery.remove(studioId: store.studioId, path: editable.path)
              onClose()
            }
          }
          .disabled(!canSave)
          .accessibilityIdentifier("note-save-button")
        }
      }
      .alert("Note not found", isPresented: $notFound) {
        Button("OK", role: .cancel) {}
      } message: {
        Text("That link doesn't point to a note in this Studio yet.")
      }
      .confirmationDialog(
        "Move this note to Trash?", isPresented: $confirmingDelete, titleVisibility: .visible
      ) {
        Button("Move to Trash", role: .destructive) {
          if store.setNoteStatus(path: editable.path, status: "trashed") {
            recovery.remove(studioId: store.studioId, path: editable.path)
            onClose()
          }
        }
        Button("Cancel", role: .cancel) {}
      } message: {
        Text("It leaves your rooms but isn't gone — the file stays in the vault.")
      }
      .sheet(isPresented: $linking) {
        NotePickerSheet(
          notes: store.liveNotes.filter { !$0.title.isEmpty && $0.id != editable.path },
          onPick: { insertLink($0) },
          onClose: { linking = false })
          .studioTheme(theme)
      }
    }
    .task {
      store.dismissConflict()  // never inherit a conflict left by another flow
      loadExistingCover()
      checkForDraft()
    }
    .onChange(of: coverItem) { importPickedCover() }
    .onChange(of: note.body) { autosaveDraft() }
    .onChange(of: titleText) { autosaveDraft() }
    .sheet(
      item: Binding(get: { store.conflict }, set: { if $0 == nil { store.dismissConflict() } })
    ) { conflict in
      ConflictMergeView(
        conflict: conflict,
        onKeepStored: {
          store.dismissConflict()
          onClose()
        },
        onOverwrite: { if store.resolveConflictOverwrite() { onClose() } },
        onSaveAsNew: { if store.resolveConflictSaveAsNew() { onClose() } }
      )
      .studioTheme(theme)
    }
  }

  // A cover-image row: the current cover thumbnail (if any) + a photo picker that
  // imports one into the vault (validated + written through the Rust binary path).
  private var coverSection: some View {
    VStack(alignment: .leading, spacing: 10) {
      Divider().overlay(theme.line)
      if let coverImage {
        Image(uiImage: coverImage)
          .resizable().scaledToFill()
          .frame(maxWidth: .infinity).frame(height: 160)
          .clipShape(RoundedRectangle(cornerRadius: 10))
          .accessibilityIdentifier("note-cover-image")
      }
      PhotosPicker(selection: $coverItem, matching: .images) {
        Label(
          note.display.cover == nil ? "Add a cover image" : "Change cover image",
          systemImage: "photo")
          .font(StudioFont.control).foregroundStyle(theme.link)
      }
      .accessibilityIdentifier("note-cover-picker")
    }
  }

  private func loadExistingCover() {
    guard let reference = note.display.cover,
      let cover = store.readCover(reference: reference, forNotePath: editable.path)
    else { return }
    coverImage = UIImage(data: cover.data)
  }

  // A banner offering to restore an autosaved draft that differs from the stored note.
  private func draftBanner(_ draft: DraftRecord) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("You have an unsaved draft of this note.")
        .font(StudioFont.meta).foregroundStyle(theme.inkStrong)
      HStack(spacing: 18) {
        Button("Restore draft") {
          note.body = draft.body
          titleText = draft.title ?? ""
          recoverableDraft = nil
        }
        .font(StudioFont.control).foregroundStyle(theme.link)
        .accessibilityIdentifier("restore-draft")
        Button("Discard") {
          recovery.remove(studioId: store.studioId, path: editable.path)
          recoverableDraft = nil
        }
        .font(StudioFont.control).foregroundStyle(theme.inkMuted)
        .accessibilityIdentifier("discard-draft")
      }
    }
    .padding(12)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(RoundedRectangle(cornerRadius: 10).fill(theme.accentSoft))
  }

  private func checkForDraft() {
    guard
      case .recoverable(let draft) = recovery.readForDurable(
        studioId: store.studioId, path: editable.path, durableHash: editable.baseHash),
      draft.body != editable.note.body || draft.title != editable.note.title
    else { return }
    recoverableDraft = draft
  }

  // Autosave the in-progress edit (only once it diverges from the stored note).
  private func autosaveDraft() {
    let trimmed = titleText.trimmingCharacters(in: .whitespacesAndNewlines)
    let title = trimmed.isEmpty ? nil : trimmed
    guard note.body != editable.note.body || title != editable.note.title else {
      recovery.remove(studioId: store.studioId, path: editable.path)
      return
    }
    recovery.write(
      DraftRecord(
        studioId: store.studioId, path: editable.path, title: title, body: note.body,
        expectedHash: editable.baseHash, updatedAt: NoteFactory.isoTimestamp()))
  }

  private func importPickedCover() {
    guard let coverItem else { return }
    Task {
      guard let data = try? await coverItem.loadTransferable(type: Data.self) else { return }
      if let reference = store.setCover(data: data, forNotePath: editable.path) {
        await MainActor.run {
          note.display = NoteDisplay(cover: reference, featured: note.display.featured)
          coverImage = UIImage(data: data)
        }
      }
    }
  }

  private func fieldLabel(_ text: String) -> some View {
    Text(text.uppercased())
      .font(StudioFont.eyebrow).tracking(1.6).foregroundStyle(theme.inkFaint)
  }

  // Insert a `[[Title]]` wikilink into the body (appended, with tidy spacing).
  private func insertLink(_ title: String) {
    let link = "[[\(title)]]"
    let separator = note.body.isEmpty || note.body.hasSuffix(" ") || note.body.hasSuffix("\n")
      ? "" : " "
    note.body += separator + link
  }
}

// Pick a note to link to — a searchable list of titles that inserts a `[[Title]]`.
private struct NotePickerSheet: View {
  @Environment(\.studioTheme) private var theme
  let notes: [NoteSummary]
  let onPick: (String) -> Void
  let onClose: () -> Void
  @State private var query = ""

  private var matches: [NoteSummary] {
    let trimmed = query.trimmingCharacters(in: .whitespaces)
    guard !trimmed.isEmpty else { return notes }
    return notes.filter { $0.title.localizedCaseInsensitiveContains(trimmed) }
  }

  var body: some View {
    NavigationStack {
      List {
        if matches.isEmpty {
          Text("No notes to link to yet.")
            .font(StudioFont.meta).foregroundStyle(theme.inkFaint)
            .studioRoomRow()
        } else {
          ForEach(matches) { note in
            Button { onPick(note.title); onClose() } label: {
              Text(note.title).font(StudioFont.body).foregroundStyle(theme.inkStrong)
                .frame(maxWidth: .infinity, alignment: .leading).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .studioRoomRow()
            .accessibilityIdentifier("link-pick-\(note.id)")
          }
        }
      }
      .studioRoomList(theme.canvas)
      .searchable(text: $query, prompt: "Search notes")
      .navigationTitle("Link a note")
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Cancel") { onClose() } }
      }
    }
  }
}

// A single calm invitation beside the Gift — accept to open the aligned flow, or wave
// it away with "Not now".
private struct InvitationCard: View {
  @Environment(\.studioTheme) private var theme
  let invitation: Invitation
  let onAccept: () -> Void
  let onDismiss: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text(invitation.title.uppercased())
        .font(StudioFont.eyebrow).tracking(1.4).foregroundStyle(theme.vision)
      Text(invitation.body)
        .font(StudioFont.pageSubtitle).foregroundStyle(theme.inkStrong)
        .fixedSize(horizontal: false, vertical: true)
      HStack(spacing: 18) {
        Button(invitation.acceptLabel, action: onAccept)
          .font(StudioFont.control).foregroundStyle(theme.link)
          .accessibilityIdentifier("invitation-accept")
        Button("Not now", action: onDismiss)
          .font(StudioFont.control).foregroundStyle(theme.inkMuted)
          .accessibilityIdentifier("invitation-dismiss")
      }
    }
    .padding(16)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(RoundedRectangle(cornerRadius: 12).fill(theme.accentSoft))
    .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(theme.line, lineWidth: 1))
    .accessibilityIdentifier("invitation-card")
  }
}

// Search the vault by title or body text. Tapping a result opens it for editing.
// SearchView now lives in Search/SearchView.swift (faceted, over the P4 index).

// Settings: for now, the theme picker. Choosing a palette persists it and recolors
// the whole app live (the selection re-renders the environment above RootView).
private struct SettingsView: View {
  @Environment(\.studioTheme) private var theme
  let themeStore: ThemeStore
  let store: VaultStore
  let homePlace: HomePlaceStore
  let location: LocationHemisphere
  let onClose: () -> Void
  let onReplayTour: () -> Void
  let onChangeFolder: () -> Void
  @State private var profileName: String = ""
  @State private var avatarItem: PhotosPickerItem?
  @State private var locatingHome = false

  private func commitName() {
    if profileName != (store.profileName ?? "") { _ = store.setProfileName(profileName) }
  }

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 0) {
          Text("PROFILE")
            .font(StudioFont.eyebrow).tracking(1.6).foregroundStyle(theme.inkFaint)
            .padding(.bottom, 12)
          HStack(spacing: 14) {
            ProfileAvatar(store: store, size: 60)
            VStack(alignment: .leading, spacing: 4) {
              TextField("Your name", text: $profileName)
                .font(StudioFont.cardTitle).foregroundStyle(theme.inkStrong)
                .textInputAutocapitalization(.words)
                .submitLabel(.done)
                .onSubmit(commitName)
                .accessibilityIdentifier("profile-name-field")
              PhotosPicker(selection: $avatarItem, matching: .images) {
                Text(store.profileAvatar() == nil ? "Add a photo" : "Change photo")
                  .font(StudioFont.meta).foregroundStyle(theme.link)
              }
              .accessibilityIdentifier("profile-photo-picker")
            }
            Spacer(minLength: 0)
          }
          .padding(.vertical, 6)
          Divider().overlay(theme.line)

          Button {
            onReplayTour()
          } label: {
            HStack {
              Text("Take the tour").font(StudioFont.cardTitle).foregroundStyle(theme.inkStrong)
              Spacer()
              Image(systemName: "sparkles").font(.system(size: 12)).foregroundStyle(theme.inkFaint)
            }
            .padding(.vertical, 14)
          }
          .accessibilityIdentifier("take-tour-button")
          Divider().overlay(theme.line)

          Text("STUDIO")
            .font(StudioFont.eyebrow).tracking(1.6).foregroundStyle(theme.inkFaint)
            .padding(.top, 24).padding(.bottom, 8)
          Button {
            onChangeFolder()
          } label: {
            HStack {
              VStack(alignment: .leading, spacing: 2) {
                Text(store.vaultName.isEmpty ? "No folder chosen" : store.vaultName)
                  .font(StudioFont.cardTitle).foregroundStyle(theme.inkStrong)
                Text("Choose folder…").font(StudioFont.meta).foregroundStyle(theme.link)
              }
              Spacer()
              Image(systemName: "folder").font(.system(size: 12)).foregroundStyle(theme.inkFaint)
            }
            .padding(.vertical, 14)
          }
          .accessibilityIdentifier("change-folder-button")
          Divider().overlay(theme.line)

          Text("ROOMS")
            .font(StudioFont.eyebrow).tracking(1.6).foregroundStyle(theme.inkFaint)
            .padding(.top, 24).padding(.bottom, 8)
          Text("Reveal rooms as you're ready for them.")
            .font(StudioFont.meta).foregroundStyle(theme.inkFaint).padding(.bottom, 8)
          ForEach(Room.all.filter { !Preferences.coreRooms.contains($0.id) }) { room in
            Toggle(
              room.title,
              isOn: Binding(
                get: { Preferences.isRoomVisible(room.id, store.preferences) },
                set: { store.setRoomVisible(room.id, $0) })
            )
            .font(StudioFont.body).foregroundStyle(theme.inkStrong)
            .padding(.vertical, 8)
            .accessibilityIdentifier("room-toggle-\(room.id)")
            Divider().overlay(theme.line)
          }

          Text("FOYER")
            .font(StudioFont.eyebrow).tracking(1.6).foregroundStyle(theme.inkFaint)
            .padding(.top, 24).padding(.bottom, 8)
          ForEach(
            [("becoming", "Becoming"), ("feelings", "How I want to feel"), ("principles", "Principles")],
            id: \.0
          ) { id, label in
            Toggle(
              label,
              isOn: Binding(
                get: { Preferences.isFoyerSectionVisible(id, store.preferences) },
                set: { store.setFoyerSectionVisible(id, $0) })
            )
            .font(StudioFont.body).foregroundStyle(theme.inkStrong)
            .padding(.vertical, 8)
            .accessibilityIdentifier("section-toggle-\(id)")
            Divider().overlay(theme.line)
          }

          Text("RHYTHM")
            .font(StudioFont.eyebrow).tracking(1.6).foregroundStyle(theme.inkFaint)
            .padding(.top, 24).padding(.bottom, 8)
          rhythmToggle("Moon", keyPath: \.moon)
          rhythmToggle("Micro-season", keyPath: \.microSeason)
          rhythmToggle("Cycle", keyPath: \.cycle)
          VStack(alignment: .leading, spacing: 6) {
            Text("Seasons").font(StudioFont.body).foregroundStyle(theme.inkStrong)
            Picker(
              "Seasons",
              selection: Binding(
                get: { store.preferences.rhythm.resolvedSeasonStyle },
                set: { store.setSeasonStyle($0) })
            ) {
              ForEach(SeasonStyle.allCases, id: \.self) { Text($0.label).tag($0) }
            }
            .pickerStyle(.segmented)
            .accessibilityIdentifier("season-style-picker")
          }
          .padding(.vertical, 8)
          personalizeMicroSeasonsRow
          homePlaceRow

          Text("THEME")
            .font(StudioFont.eyebrow).tracking(1.6).foregroundStyle(theme.inkFaint)
            .padding(.top, 24).padding(.bottom, 8)
          ForEach(StudioTheme.all, id: \.id) { palette in
            Button {
              themeStore.selectedId = palette.id
            } label: {
              themeRow(palette)
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("theme-\(palette.id)")
            Divider().overlay(theme.line)
          }

          Text("MAINTENANCE")
            .font(StudioFont.eyebrow).tracking(1.6).foregroundStyle(theme.inkFaint)
            .padding(.top, 24).padding(.bottom, 8)
          NavigationLink {
            RepairView(store: store)
          } label: {
            HStack {
              Text("Repair notes & links").font(StudioFont.cardTitle).foregroundStyle(theme.inkStrong)
              Spacer()
              Image(systemName: "chevron.right").font(.system(size: 12)).foregroundStyle(theme.inkFaint)
            }
            .padding(.vertical, 14)
          }
          .accessibilityIdentifier("repair-links-button")
          Divider().overlay(theme.line)
          NavigationLink {
            DiagnosticsView(store: store)
          } label: {
            HStack {
              Text("Diagnostics").font(StudioFont.cardTitle).foregroundStyle(theme.inkStrong)
              Spacer()
              Image(systemName: "chevron.right").font(.system(size: 12)).foregroundStyle(theme.inkFaint)
            }
            .padding(.vertical, 14)
          }
          .accessibilityIdentifier("diagnostics-button")
          Divider().overlay(theme.line)
          NavigationLink {
            ExportView(store: store)
          } label: {
            HStack {
              Text("Export a backup").font(StudioFont.cardTitle).foregroundStyle(theme.inkStrong)
              Spacer()
              Image(systemName: "chevron.right").font(.system(size: 12)).foregroundStyle(theme.inkFaint)
            }
            .padding(.vertical, 14)
          }
          .accessibilityIdentifier("export-button")
          Divider().overlay(theme.line)
          NavigationLink {
            ImportView(store: store)
          } label: {
            HStack {
              Text("Import a backup").font(StudioFont.cardTitle).foregroundStyle(theme.inkStrong)
              Spacer()
              Image(systemName: "chevron.right").font(.system(size: 12)).foregroundStyle(theme.inkFaint)
            }
            .padding(.vertical, 14)
          }
          .accessibilityIdentifier("import-button")
          Divider().overlay(theme.line)
          NavigationLink {
            RevisionHistoryView(store: store)
          } label: {
            HStack {
              Text("Version history").font(StudioFont.cardTitle).foregroundStyle(theme.inkStrong)
              Spacer()
              Image(systemName: "chevron.right").font(.system(size: 12)).foregroundStyle(theme.inkFaint)
            }
            .padding(.vertical, 14)
          }
          .accessibilityIdentifier("history-button")
        }
        .padding(24)
        .frame(maxWidth: .infinity, alignment: .leading)
      }
      .background(theme.canvas)
      .onAppear { profileName = store.profileName ?? "" }
      .onChange(of: avatarItem) { _, item in
        guard let item else { return }
        Task {
          if let data = try? await item.loadTransferable(type: Data.self) {
            _ = store.setProfileAvatar(data: data)
          }
        }
      }
      .toolbar {
        ToolbarItem(placement: .principal) {
          Text("Settings").font(StudioFont.control).foregroundStyle(theme.inkStrong)
        }
        ToolbarItem(placement: .confirmationAction) {
          Button("Done") {
            commitName()
            onClose()
          }
        }
      }
    }
  }

  // Personalise the micro-season with the on-device model (private; nothing leaves the phone).
  private var personalizeMicroSeasonsRow: some View {
    Toggle(
      "Personalise micro-seasons · on-device",
      isOn: Binding(
        get: { store.preferences.rhythm.resolvedPersonalizeMicroSeasons },
        set: { store.setPersonalizeMicroSeasons($0) })
    )
    .font(StudioFont.body).foregroundStyle(theme.inkStrong)
    .padding(.vertical, 8)
    .accessibilityIdentifier("rhythm-toggle-Personalize")
  }

  // Where you live now — used only to colour the personalised micro-season by local climate.
  private var homePlaceRow: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text("Home").font(StudioFont.body).foregroundStyle(theme.inkStrong)
      Text(homePlace.place?.name ?? "Not set — uses your region")
        .font(StudioFont.meta).foregroundStyle(theme.inkMuted)
        .accessibilityIdentifier("home-place-name")
      HStack(spacing: 16) {
        Button(locatingHome ? "Locating…" : "Use my location") {
          locatingHome = true
          Task {
            if let resolved = await location.resolveHome() { homePlace.set(resolved) }
            locatingHome = false
          }
        }
        .font(StudioFont.control).foregroundStyle(theme.link)
        .disabled(locatingHome)
        .accessibilityIdentifier("home-place-locate")
        if homePlace.place != nil {
          Button("Clear") { homePlace.clear() }
            .font(StudioFont.control).foregroundStyle(theme.inkMuted)
            .accessibilityIdentifier("home-place-clear")
        }
      }
    }
    .padding(.vertical, 8)
  }

  private func rhythmToggle(
    _ label: String, keyPath: WritableKeyPath<StoredStudioPreferences.RhythmPreferences, Bool>
  ) -> some View {
    Toggle(
      label,
      isOn: Binding(
        get: { store.preferences.rhythm[keyPath: keyPath] },
        set: { newValue in
          var rhythm = store.preferences.rhythm
          rhythm[keyPath: keyPath] = newValue
          store.setRhythmLayers(
            moon: rhythm.moon, microSeason: rhythm.microSeason, cycle: rhythm.cycle)
        })
    )
    .font(StudioFont.body).foregroundStyle(theme.inkStrong)
    .padding(.vertical, 8)
    .accessibilityIdentifier("rhythm-toggle-\(label)")
  }

  private func themeRow(_ palette: StudioTheme) -> some View {
    HStack(spacing: 14) {
      swatches(palette)
      Text(palette.name)
        .font(StudioFont.cardTitle).foregroundStyle(theme.inkStrong)
      Spacer(minLength: 0)
      if palette.id == themeStore.selectedId {
        Image(systemName: "checkmark")
          .font(.system(size: 14, weight: .semibold)).foregroundStyle(theme.link)
      }
    }
    .padding(.vertical, 14)
    .contentShape(Rectangle())
  }

  // A little cluster of the palette's canvas + meaning colours, so the choice is
  // legible at a glance without applying it.
  private func swatches(_ palette: StudioTheme) -> some View {
    HStack(spacing: 3) {
      ForEach(
        Array([palette.canvas, palette.vision, palette.growth, palette.reflection].enumerated()),
        id: \.offset
      ) { _, colour in
        RoundedRectangle(cornerRadius: 3)
          .fill(colour)
          .frame(width: 14, height: 22)
      }
    }
    .overlay(RoundedRectangle(cornerRadius: 3).stroke(theme.line, lineWidth: 1))
  }
}

#Preview {
  RootView()
}
