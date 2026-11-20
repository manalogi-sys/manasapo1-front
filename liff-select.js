// =================================================================
// liff-select.js:どちらの公式LINEから開かれたかを見分けて、使う LIFF を決める部品
//
// 【なぜ必要か】
//   公式LINEの引っ越し(@767htvoa → @525iwdlq)の並行期間は、同じページを2つの LIFF から開く。
//     今:@767htvoa のリッチメニュー … 1ページに1つの LIFF(エンドポイント=そのページ)
//     新:@525iwdlq のリッチメニュー … LIFF は1つ(2012714412-8TOGAjf3、エンドポイント=トップ)。
//         ボタンは https://liff.line.me/2012714412-8TOGAjf3/shouhinkaiseki.html のように
//         LIFF の後ろにページ名を付けた形(2026-11-20 Manabi. が設定)。
//   新しい LIFF の URL を開くと、LINE はまずトップ(index.html)を ?liff.state=/ページ名 付きで開き、
//   トップで liff.init() すると、LIFF の部品がそのページへ移る(LINE の決まった動き)。
//   そこで、トップが liff.state 付きで開かれたら「新しい LIFF から来た」と覚えて(このタブの間だけ)、
//   移った先のページはその印を見て新しい LIFF ID で liff.init() する。
//   印は、移る先の URL にも ?ch=m として付ける(タブの記録が消える端末でも見分けられるように)。
//   リッチメニューのURLに最初から ?ch=m を付けてもらっても同じように働く。
//
// ・印が無いときは今の LIFF(各ページの LIFF_ID)を使う。今の @767htvoa からは今までどおり動く。
// ・切り替えが終わって今の LIFF を外すときは、各ページの LIFF_ID を新しいほうに変え、この部品は外してよい。
// ・index.html / shouhinkaiseki.html / searchresult.html / irailist.html で読み込んでいる。
// =================================================================
const LiffSelect = (() => {
    const NEW_LIFF_ID = "2012714412-8TOGAjf3"; // プロバイダー「マナサポ」・@525iwdlq 用
    const MARK_KEY = "aiSatei.liffNew";
    const MARK_PARAM = "ch";
    const MARK_VALUE = "m";

    function load() { try { return sessionStorage.getItem(MARK_KEY); } catch (e) { return null; } }
    function save() { try { sessionStorage.setItem(MARK_KEY, "1"); } catch (e) {} }

    // このページを新しい LIFF で開いたか(URLの ?ch=m か、トップで覚えた印)
    function isNew() {
        const params = new URLSearchParams(location.search);
        if (params.get(MARK_PARAM) === MARK_VALUE) { save(); return true; }
        return load() === "1";
    }

    // このページで使う LIFF ID(oldId:そのページの今の LIFF ID)
    function liffId(oldId) {
        return isNew() ? NEW_LIFF_ID : oldId;
    }

    // LINEの中で開き直して新しい本人証明書をもらうときのURL(page:"shouhinkaiseki.html" など)
    function reopenUrl(oldId, page) {
        return isNew()
            ? "https://liff.line.me/" + NEW_LIFF_ID + "/" + page + "?" + MARK_PARAM + "=" + MARK_VALUE
            : "https://liff.line.me/" + oldId;
    }

    // liff.login() の戻り先(新しい LIFF はエンドポイントがトップなので、戻り先を今のページにする)
    function loginOptions() {
        return isNew() ? { redirectUri: location.href } : undefined;
    }

    /**
     * トップ(index.html)の最初に呼ぶ。新しい LIFF から開かれた(liff.state がある)ときは、
     * LIFF の部品を読み込んで liff.init() し、目的のページへ移ってもらう。移るときは true を返す。
     */
    function handleEndpoint(onError) {
        const params = new URLSearchParams(location.search);
        const state = params.get("liff.state");
        if (state === null) return false;
        save();

        // 移る先の URL に印(?ch=m)を足しておく
        if (state && state.charAt(0) === "/" && state.indexOf(MARK_PARAM + "=" + MARK_VALUE) < 0) {
            const marked = state + (state.indexOf("?") >= 0 ? "&" : "?") + MARK_PARAM + "=" + MARK_VALUE;
            params.set("liff.state", marked);
            history.replaceState(null, "", location.pathname + "?" + params.toString() + location.hash);
        }

        const script = document.createElement("script");
        script.src = "https://static.line-scdn.net/liff/edge/2/sdk.js";
        script.onload = () => {
            liff.init({ liffId: NEW_LIFF_ID }).catch(err => {
                console.error("LINE初期化エラー: " + err.toString());
                if (onError) onError(err);
            });
        };
        script.onerror = () => { if (onError) onError(new Error("LIFFの部品を読み込めませんでした")); };
        document.head.appendChild(script);
        return true;
    }

    return { NEW_LIFF_ID, isNew, liffId, reopenUrl, loginOptions, handleEndpoint };
})();
