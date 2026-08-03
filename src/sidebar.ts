import { DisposableDelegate, IDisposable } from '@lumino/disposable';
import { ISignal, Signal } from '@lumino/signaling';
import { IGitSidebar } from './tokens';

interface ISectionEntry {
  section: IGitSidebar.ISection;
  order: number;
  registration: IDisposable;
}

/**
 * Default implementation of the Git sidebar section registry.
 */
export class GitSidebar implements IGitSidebar {
  /**
   * Whether the registry has been disposed.
   */
  get isDisposed(): boolean {
    return this._isDisposed;
  }

  /**
   * The registered sections, ordered by rank and registration order.
   */
  get sections(): ReadonlyArray<IGitSidebar.ISection> {
    return [...this._sections.values()]
      .sort((a, b) => {
        const rankDifference =
          (a.section.rank ?? 100) - (b.section.rank ?? 100);
        return rankDifference || a.order - b.order;
      })
      .map(entry => entry.section);
  }

  /**
   * A signal emitted when a section is registered or removed.
   */
  get changed(): ISignal<IGitSidebar, void> {
    return this._changed;
  }

  /**
   * Register a section in the Git sidebar.
   */
  registerSection(section: IGitSidebar.ISection): IDisposable {
    if (this._isDisposed) {
      throw new Error('Cannot register a section on a disposed Git sidebar.');
    }
    if (!section.id) {
      throw new Error('Git sidebar sections must have a non-empty identifier.');
    }
    if (this._sections.has(section.id)) {
      throw new Error(
        `A Git sidebar section with id "${section.id}" is already registered.`
      );
    }

    const registration = new DisposableDelegate(() => {
      const entry = this._sections.get(section.id);
      if (!entry || entry.section !== section) {
        return;
      }
      this._sections.delete(section.id);
      section.widget.dispose();
      if (!this._isDisposed) {
        this._changed.emit(undefined);
      }
    });

    this._sections.set(section.id, {
      section,
      order: this._nextOrder++,
      registration
    });
    this._changed.emit(undefined);
    return registration;
  }

  /**
   * Dispose the registry and remove all section contributions.
   */
  dispose(): void {
    if (this._isDisposed) {
      return;
    }
    this._isDisposed = true;
    [...this._sections.values()].forEach(entry => {
      entry.registration.dispose();
    });
    this._sections.clear();
    Signal.clearData(this);
  }

  private _isDisposed = false;
  private _nextOrder = 0;
  private _sections = new Map<string, ISectionEntry>();
  private _changed = new Signal<IGitSidebar, void>(this);
}
