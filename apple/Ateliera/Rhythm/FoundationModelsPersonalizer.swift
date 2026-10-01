import Foundation

#if canImport(FoundationModels)
  import FoundationModels
#endif

// On-device Apple Intelligence adapter for personalising the micro-season. Fully gated:
// compiles only where the framework exists, runs only on iOS/macOS 26+ with an available
// model, and returns nil in every other case so the caller keeps the deterministic base.
// Weak-linked (project.yml OTHER_LDFLAGS) so the iOS-17 app launches on devices without it.
// Nothing leaves the device.
struct FoundationModelsPersonalizer: MicroSeasonPersonalizer {
  func personalize(_ request: MicroSeasonRequest) async -> MicroSeason? {
    #if canImport(FoundationModels)
      if #available(iOS 26, macOS 26, *) {
        return await Self.generate(request)
      }
    #endif
    return nil
  }

  #if canImport(FoundationModels)
    @available(iOS 26, macOS 26, *)
    private static func generate(_ request: MicroSeasonRequest) async -> MicroSeason? {
      guard case .available = SystemLanguageModel.default.availability else { return nil }
      let session = LanguageModelSession(instructions: instructions)
      do {
        let response = try await session.respond(
          to: prompt(for: request), generating: GeneratedMicroSeason.self)
        let term = response.content.term.trimmingCharacters(in: .whitespacesAndNewlines)
        let gloss = response.content.gloss.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !term.isEmpty, !gloss.isEmpty else { return nil }
        return MicroSeason(term: term, gloss: gloss)
      } catch {
        return nil
      }
    }

    @available(iOS 26, macOS 26, *)
    private static let instructions = """
      You write micro-seasons: the tiny, felt turns of the year, in the spirit of nature almanacs.
      Given a place's climate, the season, and the moon, write ONE short micro-season for right now.
      Rules:
      - Original language only. Never reproduce, translate, or imitate the names or lore of any \
      culture's calendar (for example Japanese kō/sekki, Chinese solar terms, or Aboriginal \
      seasonal calendars). They inspire only the FORM — small sensory observations of the turning year.
      - Ground it in the given local climate and what would actually be happening there now.
      - Calm, sensory, specific. No advice, no instructions, no self-help.
      - name: 2–5 words. observation: one short sentence, under ~12 words.
      """

    @available(iOS 26, macOS 26, *)
    private static func prompt(for r: MicroSeasonRequest) -> String {
      let hemisphere = r.hemisphere == .north ? "northern" : "southern"
      return """
        Place: \(r.placeName) (\(r.climate.label) climate, \(hemisphere) hemisphere)
        Date: \(r.date). Season: \(r.season.rawValue). Moon: \(r.lunarSeason.rawValue).
        The generic micro-season for this window is "\(r.baseTerm)" — \(r.baseGloss).
        Write the local micro-season for this place and window.
        """
    }
  #endif
}

#if canImport(FoundationModels)
  @available(iOS 26, macOS 26, *)
  @Generable
  private struct GeneratedMicroSeason {
    @Guide(description: "A 2–5 word original name for this local micro-season")
    var term: String
    @Guide(description: "One short sensory sentence, under 12 words, no advice")
    var gloss: String
  }
#endif
