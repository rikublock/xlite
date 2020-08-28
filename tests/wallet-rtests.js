import 'should';
import {all, create} from 'mathjs';
import domStorage from '../src/app/modules/dom-storage';
const math = create(all, {
  number: 'BigNumber',
  precision: 64
});
const { bignumber } = math;

import CCWalletConf from '../src/app/types/ccwalletconf';
import FakeRPCController from './fake-rpc-controller';
import {localStorageKeys} from '../src/app/constants';
import Recipient from '../src/app/types/recipient';
import RPCController from '../src/app/modules/rpc-controller';
import RPCTransaction from '../src/app/types/rpc-transaction';
import RPCUnspent from '../src/app/types/rpc-unspent';
import Token from '../src/app/types/token';
import {unixTime} from '../src/app/util';
import Wallet from '../src/app/types/wallet';
import XBridgeInfo from '../src/app/types/xbridgeinfo';

describe('Wallet Test Suite', function() {
  let token;
  let conf;
  beforeEach(function() {
    domStorage.clear();
    token = new Token({
      "blockchain": "Blocknet",
      "ticker": "BLOCK",
      "ver_id": "blocknet--v4.0.1",
      "ver_name": "Blocknet v4",
      "conf_name": "blocknet.conf",
      "dir_name_linux": "blocknet",
      "dir_name_mac": "Blocknet",
      "dir_name_win": "Blocknet",
      "repo_url": "https://github.com/blocknetdx/blocknet",
      "versions": [
        "v4.3.0"
      ],
      "xbridge_conf": "blocknet--v4.0.1.conf",
      "wallet_conf": "blocknet--v4.0.1.conf"
    });
    token.xbinfo = new XBridgeInfo({ ticker: 'BLOCK', feeperbyte: 20, mintxfee: 10000, coin: 100000000, rpcport: 41414 });
    conf = new CCWalletConf(token.ticker, {
      "rpcPassword": "test",
      "fee": 1.0E-4,
      "rpcUsername": "testUser",
      "rpcPort": 41414,
      "feeFlat": true,
      "rpcEnabled": true,
      "addressCount": 20
    });
  });

  it('Wallet()', function() {
    const wallet = new Wallet(token, conf, domStorage);
    wallet._token.should.be.eql(token);
    wallet._conf.should.be.eql(conf);
    wallet._domStorage.should.be.eql(domStorage);
    wallet.ticker.should.be.equal(token.ticker);
    wallet.ticker.should.be.equal(conf.ticker());
    wallet.name.should.be.equal(token.blockchain);
    wallet.imagePath.should.be.equal(Wallet.getImage(wallet.ticker));
    wallet.rpcEnabled().should.be.true();
    wallet.rpc.should.be.eql(new RPCController(41414, 'testUser', 'test'));
  });
  it('Wallet.rpcEnabled() Wallet.initRpcIfEnabled()', function() {
    const wallet = new Wallet(token, conf, domStorage);
    wallet.initRpcIfEnabled();
    wallet.rpcEnabled().should.be.true();
    wallet.rpc.should.be.eql(new RPCController(41414, 'testUser', 'test'));
    conf.rpcEnabled = false;
    const wallet2 = new Wallet(token, conf, domStorage);
    wallet2.initRpcIfEnabled();
    wallet2.rpcEnabled().should.be.false();
    wallet2.rpc.should.be.eql(new RPCController(0, '', ''));
  });
  it('Wallet.initRpcIfEnabled() should set default port from token conf', function() {
    conf.rpcPort = -1000;
    const wallet = new Wallet(token, conf, domStorage);
    wallet.initRpcIfEnabled();
    wallet.rpc.should.be.eql(new RPCController(41414, 'testUser', 'test'));
  });
  it('Wallet.blockchain()', function() {
    const wallet = new Wallet(token, conf, domStorage);
    wallet.blockchain().should.be.equal(token.blockchain);
  });
  it('Wallet.token()', function() {
    const wallet = new Wallet(token, conf, domStorage);
    wallet.token().should.be.eql(token);
  });
  it('Wallet.getBalance()', async function() {
    const fakerpc = new FakeRPCController();
    const wallet = new Wallet(token, conf, domStorage);
    wallet.rpc = fakerpc;
    const fakeUtxos = await fakerpc.listUnspent();
    const fakeBalance = [bignumber(0), bignumber(0)];
    for (const fakeUtxo of fakeUtxos) {
      fakeBalance[0] = (math.add(fakeBalance[0], bignumber(fakeUtxo.amount))).toFixed(8);
      fakeBalance[1] = (math.add(fakeBalance[1], bignumber(fakeUtxo.spendable ? fakeUtxo.amount : 0))).toFixed(8);
    }
    const balance = await wallet.getBalance();
    balance.should.be.eql(fakeBalance);
  });
  it('Wallet.getTransactions()', async function() {
    const fakerpc = new FakeRPCController();
    const wallet = new Wallet(token, conf, domStorage);
    wallet.rpc = fakerpc;
    const fakeTxs = await fakerpc.listTransactions();
    await wallet.updateTransactions();
    const txs = wallet.getTransactions();
    txs.should.be.eql(fakeTxs);
  });
  it('Wallet.getTransactions() with timeframe', async function() {
    const fakerpc = new FakeRPCController();
    const wallet = new Wallet(token, conf, domStorage);
    wallet.rpc = fakerpc;
    const startTime = 1596654100;
    const endTime = 1596654200;
    const fakeTxs = await fakerpc.listTransactions(startTime, endTime);
    await wallet.updateTransactions();
    const txs = wallet.getTransactions(startTime, endTime);
    txs.should.be.eql(fakeTxs);
  });
  it('Wallet.getTransactions() no transactions outside timeframe', async function() {
    const fakerpc = new FakeRPCController();
    const wallet = new Wallet(token, conf, domStorage);
    wallet.rpc = fakerpc;
    const startTime = 1596664100;
    const endTime = 1596664200;
    await wallet.updateTransactions();
    const txs = wallet.getTransactions(startTime, endTime);
    txs.should.be.eql([]);
  });
  it('Wallet.getTransactions() timeframe with same start and end', async function() {
    const fakerpc = new FakeRPCController();
    const wallet = new Wallet(token, conf, domStorage);
    wallet.rpc = fakerpc;
    const startTime = 1596654100;
    const endTime = 1596654100;
    const fakeTxs = await fakerpc.listTransactions(startTime, endTime);
    await wallet.updateTransactions();
    const txs = wallet.getTransactions(startTime, endTime);
    txs.should.be.eql(fakeTxs);
    txs.length.should.be.equal(1); // expecting only 1 transaction
  });
  it('Wallet.updateTransactions()', async function() {
    const fakerpc = new FakeRPCController();
    const wallet = new Wallet(token, conf, domStorage);
    wallet.rpc = fakerpc;
    const fakeTxs = await fakerpc.listTransactions();
    await wallet.updateTransactions().should.finally.be.true();
    const txs = wallet.getTransactions();
    txs.should.be.eql(fakeTxs);
  });
  it('Wallet.updateTransactions() should not update too soon', async function() {
    const fakerpc = new FakeRPCController();
    const wallet = new Wallet(token, conf, domStorage);
    wallet.rpc = fakerpc;
    await wallet.updateTransactions().should.finally.be.true();
    await wallet.updateTransactions().should.finally.be.false(); // no update too soon
  });
  it('Wallet._needsTransactionUpdate()', function() {
    const fakerpc = new FakeRPCController();
    const wallet = new Wallet(token, conf, domStorage);
    wallet.rpc = fakerpc;
    wallet._needsTransactionUpdate().should.be.true();
    wallet._setLastTransactionFetchTime(unixTime());
    wallet._needsTransactionUpdate().should.be.false();
  });
  it('Wallet._getLastTransactionFetchTime()', async function() {
    const fakerpc = new FakeRPCController();
    const wallet = new Wallet(token, conf, domStorage);
    wallet.rpc = fakerpc;
    wallet._getLastTransactionFetchTime().should.be.equal(0); // check default state
    await wallet.updateTransactions();
    const fetchTime = domStorage.getItem(wallet._getTransactionFetchTimeStorageKey());
    wallet._getLastTransactionFetchTime().should.be.equal(fetchTime);
  });
  it('Wallet._getLastTransactionFetchTime() negative fetch time should be 0', async function() {
    const fakerpc = new FakeRPCController();
    const wallet = new Wallet(token, conf, domStorage);
    wallet.rpc = fakerpc;
    domStorage.setItem(wallet._getTransactionFetchTimeStorageKey(), -1000);
    wallet._getLastTransactionFetchTime().should.be.equal(0);
  });
  it('Wallet._setLastTransactionFetchTime()', async function() {
    const fakerpc = new FakeRPCController();
    const wallet = new Wallet(token, conf, domStorage);
    wallet.rpc = fakerpc;
    wallet._setLastTransactionFetchTime(2500);
    domStorage.getItem(wallet._getTransactionFetchTimeStorageKey()).should.be.equal(2500);
  });
  it('Wallet._setLastTransactionFetchTime() when less than 0 should set 0', async function() {
    const fakerpc = new FakeRPCController();
    const wallet = new Wallet(token, conf, domStorage);
    wallet.rpc = fakerpc;
    wallet._setLastTransactionFetchTime(-1000);
    domStorage.getItem(wallet._getTransactionFetchTimeStorageKey()).should.be.equal(0);
  });
  it('Wallet._getTransactionStorageKey()', async function() {
    const fakerpc = new FakeRPCController();
    const wallet = new Wallet(token, conf, domStorage);
    wallet.rpc = fakerpc;
    wallet._getTransactionStorageKey().should.be.equal(localStorageKeys.TRANSACTIONS + '_' + wallet.ticker);
  });
  it('Wallet._getTransactionFetchTimeStorageKey()', async function() {
    const fakerpc = new FakeRPCController();
    const wallet = new Wallet(token, conf, domStorage);
    wallet.rpc = fakerpc;
    wallet._getTransactionFetchTimeStorageKey().should.be.equal(localStorageKeys.TX_LAST_FETCH_TIME + '_' + wallet.ticker);
  });
  it('Wallet._getTransactionsFromStorage()', async function() {
    const fakerpc = new FakeRPCController();
    const wallet = new Wallet(token, conf, domStorage);
    wallet.rpc = fakerpc;
    const fakeTxs = await fakerpc.listTransactions();
    await wallet.updateTransactions();
    wallet._getTransactionsFromStorage(0, 5000000000).should.be.eql(fakeTxs);
  });
  it('Wallet._getTransactionsFromStorage() end less than start should set end=start', async function() {
    const fakerpc = new FakeRPCController();
    fakerpc.listTransactions = () => {
      return [
        new RPCTransaction({ txId: 'A', address: 'afjdsakjfksdajk', amount: 10.000, time: 1000 }),
        new RPCTransaction({ txId: 'B', address: 'afjdsakjfksdajk', amount: 10.000, time: 2000 }),
        new RPCTransaction({ txId: 'c', address: 'afjdsakjfksdajk', amount: 10.000, time: 3000 }),
      ];
    };
    const wallet = new Wallet(token, conf, domStorage);
    wallet.rpc = fakerpc;
    await wallet.updateTransactions();
    wallet._getTransactionsFromStorage(1000, 900).should.be.eql([fakerpc.listTransactions()[0]]);
  });
  it('Wallet._addTransactionsToStorage()', async function() {
    const fakerpc = new FakeRPCController();
    const wallet = new Wallet(token, conf, domStorage);
    wallet.rpc = fakerpc;
    const fakeTxs = await fakerpc.listTransactions();
    await wallet.updateTransactions();
    const addTxs = [
      new RPCTransaction({ txId: 'A', address: 'afjdsakjfksdajk', amount: 10.000 }),
      new RPCTransaction({ txId: 'B', address: 'afjdsakjfksdajk', amount: 11.000 }),
    ];
    wallet._addTransactionsToStorage(addTxs).should.be.true();
    wallet.getTransactions().should.eql(fakeTxs.concat(addTxs));
  });
  it('Wallet._addTransactionsToStorage() should not update non-array', async function() {
    const fakerpc = new FakeRPCController();
    const wallet = new Wallet(token, conf, domStorage);
    wallet.rpc = fakerpc;
    const fakeTxs = await fakerpc.listTransactions();
    await wallet.updateTransactions();
    wallet._addTransactionsToStorage({}).should.be.false();
    wallet.getTransactions().should.eql(fakeTxs);
  });
  it('Wallet._addTransactionsToStorage() should not include duplicates', async function() {
    const fakerpc = new FakeRPCController();
    const wallet = new Wallet(token, conf, domStorage);
    wallet.rpc = fakerpc;
    const fakeTxs = await fakerpc.listTransactions();
    await wallet.updateTransactions();
    const addTxs = [
      new RPCTransaction({ txId: 'A', address: 'afjdsakjfksdajk', amount: 10.000 }),
      new RPCTransaction({ txId: 'B', address: 'afjdsakjfksdajk', amount: 11.000 }),
    ];
    const duplTxs = [
      new RPCTransaction({ txId: 'A', address: 'afjdsakjfksdajk', amount: 10.000 }),
      new RPCTransaction({ txId: 'B', address: 'afjdsakjfksdajk', amount: 11.000 }),
    ];
    wallet._addTransactionsToStorage(addTxs.concat(duplTxs)).should.be.true();
    wallet.getTransactions().should.eql(fakeTxs.concat(addTxs));
  });
  it('Wallet._fetchTransactions()', async function() {
    const fakerpc = new FakeRPCController();
    const wallet = new Wallet(token, conf, domStorage);
    wallet.rpc = fakerpc;
    const fakeTxs = await fakerpc.listTransactions();
    const fetchTime = unixTime();
    await wallet._fetchTransactions().should.finally.be.eql(fakeTxs);
    wallet.getTransactions().should.eql(fakeTxs);
    wallet._getLastTransactionFetchTime().should.be.greaterThanOrEqual(fetchTime);
  });
  it('Wallet._fetchTransactions() should not call bad rpc', async function() {
    const wallet = new Wallet(token, conf, domStorage);
    wallet.rpc = new RPCController();
    wallet.rpc.isNull().should.be.true();
    await wallet._fetchTransactions().should.finally.be.eql([]);
    wallet.getTransactions().should.eql([]);
    wallet._getLastTransactionFetchTime().should.be.equal(0);
  });
  it('Wallet._fetchTransactions() should not update server txs if endtime < last_fetch_time', async function() {
    const fakerpc = new FakeRPCController();
    const wallet = new Wallet(token, conf, domStorage);
    wallet.rpc = fakerpc;
    const addTxs = [
      new RPCTransaction({ txId: 'A', address: 'afjdsakjfksdajk', amount: 10.000, time: 10000 }),
      new RPCTransaction({ txId: 'B', address: 'afjdsakjfksdajk', amount: 11.000, time: 10000 }),
    ];
    wallet._addTransactionsToStorage(addTxs).should.be.true();
    wallet._setLastTransactionFetchTime(20000);
    await wallet._fetchTransactions(0, 19000).should.finally.be.eql(addTxs);
  });
  it('Wallet._fetchTransactions() should return existing txs on rpc error', async function() {
    const fakerpc = new FakeRPCController();
    fakerpc.listTransactions = () => { throw new Error(''); };
    const wallet = new Wallet(token, conf, domStorage);
    wallet.rpc = fakerpc;
    const addTxs = [
      new RPCTransaction({ txId: 'A', address: 'afjdsakjfksdajk', amount: 10.000, time: 10000 }),
      new RPCTransaction({ txId: 'B', address: 'afjdsakjfksdajk', amount: 11.000, time: 10000 }),
    ];
    wallet._addTransactionsToStorage(addTxs).should.be.true();
    await wallet._fetchTransactions().should.finally.be.eql(addTxs);
  });
  it('Wallet._fetchTransactions() should not throw on rpc error', async function() {
    const fakerpc = new FakeRPCController();
    fakerpc.listTransactions = () => { throw new Error(''); };
    const wallet = new Wallet(token, conf, domStorage);
    wallet.rpc = fakerpc;
    should.doesNotThrow(await wallet._fetchTransactions, Error);
  });
  it('Wallet.getAddresses()', async function() {
    const fakerpc = new FakeRPCController();
    const wallet = new Wallet(token, conf, domStorage);
    wallet.rpc = fakerpc;
    const fakeAddrs = await fakerpc.getAddressesByAccount();
    const addrs = await wallet.getAddresses();
    addrs.should.be.eql(fakeAddrs);
  });
  it('Wallet.generateNewAddress()', async function() {
    const fakerpc = new FakeRPCController();
    const wallet = new Wallet(token, conf, domStorage);
    wallet.rpc = fakerpc;
    const fakeNewAddr = await fakerpc.getNewAddress();
    const addr = await wallet.generateNewAddress();
    addr.should.be.eql(fakeNewAddr);
  });
  it('Wallet.getCachedUnspent()', async function() {
    const fakerpc = new FakeRPCController();
    const wallet = new Wallet(token, conf, domStorage);
    wallet.rpc = fakerpc;
    (await wallet.getCachedUnspent(60)).should.be.eql(await fakerpc.listUnspent());
  });
  it('Wallet.getCachedUnspent() should return cache when not expired', async function() {
    const fakerpc = new FakeRPCController();
    const wallet = new Wallet(token, conf, domStorage);
    wallet.rpc = fakerpc;
    const utxo = new RPCUnspent({ txId: 'a8f44288f3a99972db939185deabfc2c716ba7e78cd99624657ba061d19600a0', vOut: 0, address: 'yLDs4UKRQm7yeZXAGdQFLFcoouw3aAddYt', amount: 15.00000000, scriptPubKey: '76a914fef1b70a09539048b384163e2724c6bd1d2402ea88ac', spendable: true, confirmations: 525 });
    wallet._cachedUtxos.fetchTime = unixTime() - 10;
    wallet._cachedUtxos.utxos = [utxo];
    (await wallet.getCachedUnspent(60)).should.be.eql([utxo]);
    wallet._cachedUtxos.fetchTime = unixTime() - 59;
    wallet._cachedUtxos.utxos = [utxo];
    (await wallet.getCachedUnspent(60)).should.be.eql([utxo]);
  });
  it('Wallet.getCachedUnspent() should not return cache when expired', async function() {
    const fakerpc = new FakeRPCController();
    const wallet = new Wallet(token, conf, domStorage);
    const utxo = new RPCUnspent({ txId: 'a8f44288f3a99972db939185deabfc2c716ba7e78cd99624657ba061d19600a0', vOut: 0, address: 'yLDs4UKRQm7yeZXAGdQFLFcoouw3aAddYt', amount: 15.00000000, scriptPubKey: '76a914fef1b70a09539048b384163e2724c6bd1d2402ea88ac', spendable: true, confirmations: 525 });
    fakerpc.listUnspent = async () => [utxo];
    wallet.rpc = fakerpc;
    wallet._cachedUtxos.fetchTime = unixTime() - 100;
    wallet._cachedUtxos.utxos = [];
    (await wallet.getCachedUnspent(60)).should.be.eql([utxo]);
    wallet._cachedUtxos.fetchTime = unixTime() - 60;
    wallet._cachedUtxos.utxos = [];
    (await wallet.getCachedUnspent(60)).should.be.eql([utxo]);
  });
  it('Wallet.getExplorerLinkForTx()', async function() {
    const wallet = new Wallet(token, conf, domStorage);
    wallet.getExplorerLinkForTx('a8f44288f3a99972db939185deabfc2c716ba7e78cd99624657ba061d19600a0')
      .should.be.equal('https://chainz.cryptoid.info/block/tx.dws?a8f44288f3a99972db939185deabfc2c716ba7e78cd99624657ba061d19600a0.htm')
  });
  it('Wallet.send() to one recipient should succeed', async function() {
    const fakerpc = new FakeRPCController();
    const wallet = new Wallet(token, conf, domStorage);
    wallet.rpc = fakerpc;
    const recipients = [new Recipient({ address: 'yKjhThbgKHNh9iQYL2agreSAvw5tmJGkNW', amount: 50, description: '' })];
    const txid = await wallet.send(recipients);
    should.exist(txid);
    txid.should.be.equal(await fakerpc.sendRawTransaction(''));
  });
  it('Wallet.send() to multiple recipients should succeed', async function() {
    const fakerpc = new FakeRPCController();
    const wallet = new Wallet(token, conf, domStorage);
    wallet.rpc = fakerpc;
    const recipients = [
      new Recipient({ address: 'yKjhThbgKHNh9iQYL2agreSAvw5tmJGkNW', amount: 50, description: '' }),
      new Recipient({ address: 'xw8FRKmDUkiM7cKRD7CQtJWTpUBLHcdNdv', amount: 25, description: '' }),
      new Recipient({ address: 'yK75ZDnqpgFraLBhLcrDcqt1iKLdT1egzs', amount: 15, description: '' }),
    ];
    const txid = await wallet.send(recipients);
    should.exist(txid);
    txid.should.be.equal(await fakerpc.sendRawTransaction(''));
  });
  it('Wallet.send() sending too much should fail', async function() {
    const fakerpc = new FakeRPCController();
    const wallet = new Wallet(token, conf, domStorage);
    wallet.rpc = fakerpc;
    const fakeUtxos = await wallet.rpc.listUnspent();
    const totalCoin = bignumber(fakeUtxos.map(fakeUtxo => fakeUtxo.amount)
      .reduce((acc, cur) => acc + cur)).toNumber().toFixed(8);
    const recipients = [new Recipient({ address: 'yKjhThbgKHNh9iQYL2agreSAvw5tmJGkNW', amount: totalCoin + 10, description: '' })];
    const txid = await wallet.send(recipients);
    should.not.exist(txid);
  });
  it('Wallet.send() sending to bad recipients should fail', async function() {
    const fakerpc = new FakeRPCController();
    const wallet = new Wallet(token, conf, domStorage);
    wallet.rpc = fakerpc;
    should.not.exist(await wallet.send([]));
    should.not.exist(await wallet.send(null));
    should.not.exist(await wallet.send(undefined));
    should.not.exist(await wallet.send([{}, {}]));
  });
  it('Wallet.send() with bad listUnspent rpc should fail', async function() {
    const fakerpc = new FakeRPCController();
    fakerpc.listUnspent = null;
    const wallet = new Wallet(token, conf, domStorage);
    wallet.rpc = fakerpc;
    const recipients = [new Recipient({ address: 'yKjhThbgKHNh9iQYL2agreSAvw5tmJGkNW', amount: 10, description: '' })];
    should.not.exist(await wallet.send(recipients));
  });
  it('Wallet.send() with bad xbridge info should use default', async function() {
    const fakerpc = new FakeRPCController();
    const wallet = new Wallet(token, conf, domStorage);
    wallet.rpc = fakerpc;
    wallet._token.xbinfo = null;
    const recipients = [new Recipient({ address: 'yKjhThbgKHNh9iQYL2agreSAvw5tmJGkNW', amount: 10, description: '' })];
    await wallet.send(recipients).should.be.finally.String().and.not.be.equal('');
  });
  it('Wallet.send() with bad createRawTransaction rpc should fail', async function() {
    const fakerpc = new FakeRPCController();
    fakerpc.createRawTransaction = () => { throw new Error(''); };
    const wallet = new Wallet(token, conf, domStorage);
    wallet.rpc = fakerpc;
    const recipients = [new Recipient({ address: 'yKjhThbgKHNh9iQYL2agreSAvw5tmJGkNW', amount: 10, description: '' })];
    should.not.exist(await wallet.send(recipients));
  });
  it('Wallet.send() with bad signRawTransaction rpc should fail', async function() {
    const fakerpc = new FakeRPCController();
    fakerpc.signRawTransaction = () => { throw new Error(''); };
    const wallet = new Wallet(token, conf, domStorage);
    wallet.rpc = fakerpc;
    const recipients = [new Recipient({ address: 'yKjhThbgKHNh9iQYL2agreSAvw5tmJGkNW', amount: 10, description: '' })];
    should.not.exist(await wallet.send(recipients));
  });
  it('Wallet.send() with bad sendRawTransaction rpc should fail', async function() {
    const fakerpc = new FakeRPCController();
    fakerpc.sendRawTransaction = () => { throw new Error(''); };
    const wallet = new Wallet(token, conf, domStorage);
    wallet.rpc = fakerpc;
    const recipients = [new Recipient({ address: 'yKjhThbgKHNh9iQYL2agreSAvw5tmJGkNW', amount: 10, description: '' })];
    should.not.exist(await wallet.send(recipients));
  });
});
