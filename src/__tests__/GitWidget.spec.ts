import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { nullTranslator } from '@jupyterlab/translation';
import { CommandRegistry } from '@lumino/commands';
import { Signal } from '@lumino/signaling';
import { Widget } from '@lumino/widgets';
import 'jest';
import { GitSidebar } from '../sidebar';
import { IGitExtension, IGitSidebar } from '../tokens';
import { GitWidget } from '../widgets/GitWidget';

describe('GitWidget sections', () => {
  let model: IGitExtension;
  let settings: ISettingRegistry.ISettings;
  let sidebar: GitSidebar;
  let widget: GitWidget;

  beforeEach(() => {
    model = {
      refresh: jest.fn().mockResolvedValue(undefined),
      refreshStandbyCondition: () => false
    } as unknown as IGitExtension;
    settings = {
      composite: { refreshIfHidden: false }
    } as unknown as ISettingRegistry.ISettings;
    sidebar = new GitSidebar();
  });

  afterEach(() => {
    widget?.dispose();
    sidebar.dispose();
  });

  function createGitWidget(): GitWidget {
    return new GitWidget(
      model,
      settings,
      new CommandRegistry(),
      nullTranslator.load('jupyterlab_git'),
      sidebar
    );
  }

  function createSection(id: string, rank: number): IGitSidebar.ISection {
    const widget = new Widget();
    widget.title.label = id;
    return {
      id,
      rank,
      widget
    };
  }

  it('renders registered sections in rank order', () => {
    sidebar.registerSection(createSection('history', 20));
    sidebar.registerSection(createSection('changes', 10));

    widget = createGitWidget();

    expect(widget.widgets.map(section => section.title.label)).toEqual([
      'changes',
      'history'
    ]);
    expect(widget.widgets[0].node.dataset.gitSidebarSection).toBe('changes');
  });

  it('adds and removes sections after the widget is created', () => {
    widget = createGitWidget();
    const section = new Widget();
    section.title.label = 'Section';

    const registration = sidebar.registerSection({
      id: 'section',
      widget: section
    });
    expect(widget.widgets).toEqual([section]);

    registration.dispose();
    expect(widget.widgets).toHaveLength(0);
    expect(section.isDisposed).toBe(true);
  });

  it('responds to section visibility changes', () => {
    const visibilityChanged = new Signal<object, void>({});
    const section = new Widget();
    section.title.label = 'Conditional';
    let isVisible = false;

    sidebar.registerSection({
      id: 'conditional',
      widget: section,
      isVisible: () => isVisible,
      visibilityChanged
    });
    widget = createGitWidget();
    expect(widget.widgets).toHaveLength(0);

    isVisible = true;
    visibilityChanged.emit(undefined);
    expect(widget.widgets).toEqual([section]);

    isVisible = false;
    visibilityChanged.emit(undefined);
    expect(widget.widgets).toHaveLength(0);

    isVisible = true;
    visibilityChanged.emit(undefined);
    expect(widget.widgets).toEqual([section]);
  });
});
