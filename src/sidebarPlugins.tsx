import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { ReactWidget } from '@jupyterlab/apputils';
import { IDefaultFileBrowser } from '@jupyterlab/filebrowser';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import {
  ITranslator,
  nullTranslator,
  TranslationBundle
} from '@jupyterlab/translation';
import { PanelWithToolbar } from '@jupyterlab/ui-components';
import * as React from 'react';
import { GitPanel, IGitPanelProps } from './components/GitPanel';
import { GitExtension } from './model';
import { GitSidebar } from './sidebar';
import { sectionBodyStyle } from './style/GitWidgetStyle';
import {
  GitSidebarSectionIDs,
  IGitExtension,
  IGitSidebar,
  PLUGIN_ID
} from './tokens';

/**
 * Provides the registry used by the Git sidebar and its section plugins.
 */
export const gitSidebarPlugin: JupyterFrontEndPlugin<IGitSidebar> = {
  id: '@jupyterlab/git:sidebar',
  description: 'Provides the registry for Git sidebar sections.',
  provides: IGitSidebar,
  autoStart: true,
  activate: (): IGitSidebar => new GitSidebar()
};

/**
 * Contributes the changes section to the Git sidebar.
 */
export const gitChangesSectionPlugin = createGitSectionPlugin({
  id: GitSidebarSectionIDs.changes,
  description: 'Adds the changes section to the Git sidebar.',
  rank: 10,
  title: trans => trans.__('Changes'),
  contentMode: 'changes',
  showNoRepositoryWarning: true
});

/**
 * Contributes the history section to the Git sidebar.
 */
export const gitHistorySectionPlugin = createGitSectionPlugin({
  id: GitSidebarSectionIDs.history,
  description: 'Adds the history section to the Git sidebar.',
  rank: 20,
  title: trans => trans.__('History'),
  contentMode: 'history'
});

/**
 * Contributes the branches and tags section to the Git sidebar.
 */
export const gitBranchesAndTagsSectionPlugin = createGitSectionPlugin({
  id: GitSidebarSectionIDs.branchesAndTags,
  description: 'Adds the branches and tags section to the Git sidebar.',
  rank: 30,
  title: trans => trans.__('Branches and Tags'),
  contentMode: 'branches'
});

interface IGitSectionPluginOptions {
  id: GitSidebarSectionIDs;
  description: string;
  rank: number;
  title: (trans: TranslationBundle) => string;
  contentMode: IGitPanelProps['contentMode'];
  showNoRepositoryWarning?: boolean;
}

function createGitSectionPlugin(
  options: IGitSectionPluginOptions
): JupyterFrontEndPlugin<void> {
  return {
    id: options.id,
    description: options.description,
    requires: [
      IGitSidebar,
      IGitExtension,
      IDefaultFileBrowser,
      ISettingRegistry
    ],
    optional: [ITranslator],
    autoStart: true,
    activate: async (
      app: JupyterFrontEnd,
      sidebar: IGitSidebar,
      model: IGitExtension,
      fileBrowser: IDefaultFileBrowser,
      settingRegistry: ISettingRegistry,
      translator: ITranslator | null
    ): Promise<void> => {
      translator = translator ?? nullTranslator;
      const trans = translator.load('jupyterlab_git');
      let settings: ISettingRegistry.ISettings;
      try {
        settings = await settingRegistry.load(PLUGIN_ID);
      } catch (error) {
        console.error(
          trans.__(
            'Failed to load settings for the Git sidebar section %1.',
            options.id
          ),
          error
        );
        return;
      }

      const section = createGitPanelSection(
        app,
        model as GitExtension,
        fileBrowser,
        settings,
        trans,
        options
      );
      sidebar.registerSection({
        id: options.id,
        rank: options.rank,
        widget: section
      });
    }
  };
}

function createGitPanelSection(
  app: JupyterFrontEnd,
  model: GitExtension,
  fileBrowser: IDefaultFileBrowser,
  settings: ISettingRegistry.ISettings,
  trans: TranslationBundle,
  options: IGitSectionPluginOptions
): PanelWithToolbar {
  const section = new PanelWithToolbar();
  section.title.label = options.title(trans);

  const content = ReactWidget.create(
    <GitPanel
      commands={app.commands}
      filebrowser={fileBrowser.model}
      model={model}
      settings={settings}
      trans={trans}
      contentMode={options.contentMode}
      showNoRepositoryWarning={options.showNoRepositoryWarning}
    />
  );
  content.addClass(sectionBodyStyle);
  section.addWidget(content);
  return section;
}
