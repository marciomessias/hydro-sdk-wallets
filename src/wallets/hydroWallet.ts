import { Wallet, utils, getDefaultProvider, providers, Contract } from "ethers";
import { Provider } from "ethers/providers";
import BaseWallet, { txParams } from "./baseWallet";
import { BigNumber } from "ethers/utils";
import * as ethUtil from "ethereumjs-util";

export default class HydroWallet extends BaseWallet {
  private static TIMEOUT = 15 * 60 * 1000; // 15 minutes
  private static WALLETS_KEY = "Hydro-Wallets";
  private static _cache: Map<string, any> = new Map();
  public nodeUrl?: string;
  public static TYPE_PREFIX = "Hydro-Wallet:";
  public static WALLET_NAME = "Hydro Wallet";
  public _address: string | null = null;
  public _wallet: Wallet | null = null;
  public _balance: BigNumber = new BigNumber("0");
  private _timer?: number;
  private _provider?: Provider;

  private constructor(address: string, wallet?: any) {
    super();
    this._address = address;
    this._wallet = wallet;
  }

  public static async createRandom(password: string): Promise<HydroWallet> {
    const wallet = await Wallet.createRandom();
    const hydroWallet = new HydroWallet(wallet.address, wallet);
    await hydroWallet.save(password);
    return hydroWallet;
  }

  public static async import(
    privateKey: string,
    password: string
  ): Promise<HydroWallet> {
    const wallet = await new Wallet(privateKey);
    const hydroWallet = new HydroWallet(wallet.address, wallet);
    await hydroWallet.save(password);
    return hydroWallet;
  }

  public async save(password: string): Promise<boolean> {
    if (!this._wallet || !this._address) {
      return false;
    }
    const data = await this._wallet.encrypt(password);
    const wallets = HydroWallet.getWalletData();
    const index = wallets.findIndex(
      json =>
        HydroWallet.parseWalletAddress(json) === this._address!.toLowerCase()
    );
    if (index !== -1) {
      wallets.splice(index, 1, data);
    } else {
      wallets.push(data);
    }

    HydroWallet.setWalletData(wallets);
    return true;
  }

  public delete(): boolean {
    this._wallet = null;
    HydroWallet._cache.delete(this.getAddress()!);
    const wallets = HydroWallet.getWalletData().filter(
      json => HydroWallet.parseWalletAddress(json) !== this.getAddress()
    );
    HydroWallet.setWalletData(wallets);
    return true;
  }

  public setAddress(address: string | null): void {
    this._address = address;
  }

  public setBalance(balance: BigNumber): void {
    this._balance = balance;
  }

  public getBalance(): BigNumber {
    return this._balance;
  }

  public getType(): string {
    return HydroWallet.TYPE_PREFIX + this._address;
  }

  public getAddress(): string | null {
    return this._address;
  }

  public getContract(contractAddress: string, abi: any): Contract {
    return new Contract(contractAddress, abi, this.getProvider());
  }

  public contractCall(
    contract: Contract,
    method: string,
    ...args: any
  ): Promise<any> {
    return contract[method](...args);
  }

  public setNodeUrl(nodeUrl: string): void {
    this.nodeUrl = nodeUrl;
  }

  public static list(): HydroWallet[] {
    return this.getWalletData().map(json => {
      const wallet = this.getWallet(this.parseWalletAddress(json));
      return wallet;
    });
  }

  private static setWalletData(wallets: any[]) {
    localStorage.setItem(this.WALLETS_KEY, JSON.stringify(wallets));
  }

  private static getWalletData(): any[] {
    return JSON.parse(localStorage.getItem(this.WALLETS_KEY) || "[]");
  }

  private static parseWalletAddress(json: any): string {
    return utils.getAddress(JSON.parse(json).address).toLowerCase();
  }

  private static getWallet(address: string, _wallet?: any): HydroWallet {
    let wallet = this._cache.get(address);
    if (!wallet || wallet._address !== address) {
      wallet = new this(address, _wallet);
      this._cache.set(address, wallet);
    }
    return wallet;
  }

  public signMessage(message: string | Buffer | Uint8Array): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this._wallet) {
        reject(BaseWallet.NeedUnlockWalletError);
      } else {
        resolve(this._wallet.signMessage(message));
      }
    });
  }

  public personalSignMessage(
    message: string | Buffer | Uint8Array
  ): Promise<string> {
    return this.signMessage(ethUtil.toBuffer(message));
  }

  public async sendTransaction(
    txParams: txParams
  ): Promise<string | undefined> {
    if (txParams.value) {
      txParams.value = new BigNumber(txParams.value);
    }
    if (!this._wallet) {
      return Promise.reject(BaseWallet.NeedUnlockWalletError);
    } else {
      const tx = await this._wallet.sendTransaction(txParams);
      return tx.hash;
    }
  }

  public async getTransactionReceipt(txId: string): Promise<any> {
    if (!this._wallet) {
      return Promise.reject(BaseWallet.NeedUnlockWalletError);
    } else {
      const tx = await this._wallet.provider.getTransactionReceipt(txId);
      return tx;
    }
  }

  public getAddresses(): Promise<string[]> {
    return new Promise(resolve => {
      if (this._address) {
        resolve([this._address]);
      } else {
        resolve([]);
      }
    });
  }

  public loadBalance(): Promise<BigNumber> {
    return new Promise((resolve, reject) => {
      if (!this._wallet) {
        reject(BaseWallet.NeedUnlockWalletError);
      } else {
        resolve(this._wallet.getBalance());
      }
    });
  }

  public async lock() {
    this._wallet = null;
  }

  public async unlock(password: string) {
    const json = HydroWallet.getWalletData().find(
      json => HydroWallet.parseWalletAddress(json) === this._address
    );

    this._wallet = await Wallet.fromEncryptedJson(json, password);
    this._wallet = this._wallet.connect(this.getProvider());
    this.resetTimeout();
  }

  public isLocked() {
    return !this._wallet;
  }

  public isSupported() {
    return true;
  }

  private getProvider(): Provider {
    if (this._provider) {
      return this._provider;
    }

    if (this.nodeUrl) {
      this._provider = new providers.JsonRpcProvider(this.nodeUrl);
    } else {
      this._provider = getDefaultProvider("ropsten");
    }
    return this._provider;
  }

  private resetTimeout() {
    if (this._timer) {
      window.clearTimeout(this._timer);
    }
    this._timer = window.setTimeout(() => this.lock(), HydroWallet.TIMEOUT);
  }
}
