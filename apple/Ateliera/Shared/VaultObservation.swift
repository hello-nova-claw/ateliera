import Foundation
import Observation

extension VaultStore {
  /// Calls `onChange` on the main queue after each change to the vault's notes, however
  /// it was made: a room's own action, or the shared editor deleting, archiving or
  /// re-filing a note. Room stores re-project their boards from it. Return false from
  /// `onChange` to stop; a store that has gone away does, so nothing is kept alive.
  func observeNotes(_ onChange: @escaping () -> Bool) {
    withObservationTracking {
      _ = notes
    } onChange: { [weak self] in
      // This runs before the change lands, so the room reads the vault a moment later.
      DispatchQueue.main.async {
        guard onChange() else { return }
        self?.observeNotes(onChange)
      }
    }
  }
}
