import { Dialog } from '@jupyterlab/apputils';
import { TranslationBundle } from '@jupyterlab/translation';
import { Widget } from '@lumino/widgets';

/**
 * The UI to enter the passphrase of a locked SSH key
 */
export class SSHKeyPassphraseForm
  extends Widget
  implements Dialog.IBodyWidget<string>
{
  constructor(trans: TranslationBundle, key: string, warningContent = '') {
    super();
    this.addClass('jp-CredentialsBox');

    const label = document.createElement('label');
    const text = document.createElement('span');
    text.textContent = trans.__(
      'Enter the passphrase of the SSH key to add it to the SSH agent:'
    );
    const path = document.createElement('code');
    path.className = 'jp-CredentialsBox-key';
    path.textContent = key;

    this._passphrase = document.createElement('input');
    this._passphrase.type = 'password';
    this._passphrase.placeholder = trans.__('passphrase');

    const warning = document.createElement('div');
    warning.className = 'jp-CredentialsBox-warning';
    warning.textContent = warningContent;

    label.append(text, path, this._passphrase);
    this.node.append(label, warning);
  }

  /**
   * Returns the passphrase.
   */
  getValue(): string {
    return this._passphrase.value;
  }

  private _passphrase: HTMLInputElement;
}
