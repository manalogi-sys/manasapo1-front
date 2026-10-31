// =================================================================
// app-auth.js:ホーム画面のアプリ「AI査定」用の本人確認(連携)の部品
//
// 【なぜ必要か】
//   iPhoneのホーム画面アプリは、LINEログインの画面に移るとSafariに飛んでしまい、
//   ログインした記録がアプリ側に残らない。そこで最初の1回だけ「連携」して、
//   以後はこの端末専用の鍵(appToken)をGASに送って本人を確かめてもらう。
//
// 【流れ】(GAS側の説明は manasapo1 の searchresult/アプリ連携.js)
//   1. トップページ(index.html)で「LINEと連携する」→ 合言葉と鍵を作り、LINEで連携ページを開く
//   2. 連携ページ(searchresult.html?link=合言葉)でLINEにログインし、GASに合言葉を届ける
//   3. アプリに戻ると、GASに問い合わせて連携完了 → 鍵をこの端末に保存
//
// ・LINEのリッチメニューやSafariから開いたときは、これまでどおりLIFF(LINEログイン)を使う。
//   この部品が働くのは「ホーム画面から全画面で開いたとき」だけ。
// ・index.html / shouhinkaiseki.html / searchresult.html / irailist.html で読み込んでいる。
// =================================================================
const AppAuth = (() => {
    // 連携の受付をするGAS(マナサポ商品解析結果検索)
    const GAS_LINK_URL = "https://script.google.com/macros/s/AKfycbzWTBjlsMk13LvUfiq2pr0PZ2-UPyKD-8Bmi2lc6OFkNckNrBhTsjJKZnqFVb0fV2JR/exec";
    // 連携ページを開くURL(解析の履歴のLIFF。LINEアプリで開けばログイン不要)
    const LINK_LIFF_URL = "https://liff.line.me/2011480421-iWstUz1i";
    const LINK_VALID_MS = 10 * 60 * 1000; // 合言葉の有効時間(GAS側も10分)

    const KEY_TOKEN = "aiSatei.appToken";
    const KEY_LINE_ID = "aiSatei.lineId";
    const KEY_PENDING = "aiSatei.pendingLink";

    // 保存(端末の設定によっては使えないことがあるので、失敗しても止まらないようにする)
    function load(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
    function save(key, value) { try { localStorage.setItem(key, value); } catch (e) {} }
    function remove(key) { try { localStorage.removeItem(key); } catch (e) {} }

    // ホーム画面のアイコンから(全画面で)開いているか
    function isStandalone() {
        return window.navigator.standalone === true ||
               window.matchMedia('(display-mode: standalone)').matches;
    }

    function getToken() { return load(KEY_TOKEN); }
    function getLineId() { return load(KEY_LINE_ID); }

    // 端末の鍵で動く状態か(ホーム画面から開いていて、連携済み)
    function isAppMode() { return isStandalone() && !!getToken(); }

    /**
     * 機能ページの最初に呼ぶ。
     *  {mode:"liff"}            … LINE・Safariから開いた。これまでどおりLIFFで続ける
     *  {mode:"app", lineId}     … ホーム画面から開いて連携済み。LIFFは使わない
     *  {mode:"redirect"}        … ホーム画面から開いたが未連携。トップページ(連携画面)へ移動した
     */
    function startPage() {
        if (!isStandalone()) return { mode: "liff" };
        if (!getToken()) {
            location.replace("./");
            return { mode: "redirect" };
        }
        return { mode: "app", lineId: getLineId() };
    }

    // 鍵が使えなくなったとき(シートから消された等):鍵を消して連携画面へ
    function relink() {
        remove(KEY_TOKEN);
        remove(KEY_LINE_ID);
        location.replace("./");
    }

    // 乱数から16進の文字列を作る(bytes×2文字)
    function randomHex(bytes) {
        const arr = new Uint8Array(bytes);
        crypto.getRandomValues(arr);
        return Array.from(arr, b => b.toString(16).padStart(2, "0")).join("");
    }

    // 連携を始める:合言葉と鍵を作って保存し、LINEで連携ページを開く
    function beginLink() {
        const pending = { linkCode: randomHex(16), appToken: randomHex(32), startedAt: Date.now() };
        save(KEY_PENDING, JSON.stringify(pending));
        window.open(LINK_LIFF_URL + "?link=" + pending.linkCode, "_blank");
        return pending;
    }

    // 連携待ちの情報(10分を過ぎたものは捨てる)
    function getPending() {
        let p = null;
        try { p = JSON.parse(load(KEY_PENDING) || "null"); } catch (e) {}
        if (!p) return null;
        if (Date.now() - p.startedAt > LINK_VALID_MS) { remove(KEY_PENDING); return null; }
        return p;
    }

    /**
     * 連携できたかGASに問い合わせる。
     * 戻り値:"linked"(完了) / "waiting"(まだ) / "none"(連携待ちなし・期限切れ) / それ以外はエラー文
     */
    async function checkLink() {
        const p = getPending();
        if (!p) return "none";
        const res = await fetch(GAS_LINK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
            body: "data=" + encodeURIComponent(JSON.stringify({ action: "link_check", linkCode: p.linkCode, appToken: p.appToken }))
        });
        const data = await res.json();
        if (data.status === "linked") {
            save(KEY_TOKEN, p.appToken);
            save(KEY_LINE_ID, data.lineId || "");
            remove(KEY_PENDING);
            return "linked";
        }
        if (data.status === "waiting") return "waiting";
        return data.message || "連携に失敗しました。";
    }

    // 連携ページ側:URLから合言葉を取り出す(LIFFの転送で liff.state に入っていることもある)
    function getLinkCodeFromUrl() {
        const params = new URLSearchParams(location.search);
        let code = params.get("link");
        if (!code && params.get("liff.state")) {
            const inner = new URLSearchParams(params.get("liff.state").replace(/^[^?]*\?/, ""));
            code = inner.get("link");
        }
        return (code && /^[0-9a-f]{32}$/.test(code)) ? code : null;
    }

    return { GAS_LINK_URL, isStandalone, isAppMode, getToken, getLineId, startPage, relink,
             beginLink, getPending, checkLink, getLinkCodeFromUrl };
})();
