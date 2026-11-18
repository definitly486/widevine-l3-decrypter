(async () => {
    // Инициализация глобальных переменных (в Service Worker лучше использовать globalThis или просто var/let)
    globalThis.psshs = [];
    globalThis.requests = [];
    globalThis.bodys = [];
    globalThis.mpds = [];
    globalThis.targetIds = [];
    globalThis.pageURL = "";
    globalThis.clearkey = "";

    chrome.storage.local.get("isBlock", (value) => {
        globalThis.isBlock = value.isBlock;
    });

    function convertHeaders(obj) {
        return JSON.stringify(Object.fromEntries(obj.map(header => [header.name, header.value])));
    }

    // В MV3 для доступа к локальным файлам обязательно использовать chrome.runtime.getURL
    globalThis.blockRules = await fetch(chrome.runtime.getURL("blockRules.conf")).then((r) => r.text());
    globalThis.blockRules = globalThis.blockRules.replace(/\n^\s*$|\s*\/\/.*|\s*$/gm, "").split("\n");

    function testBlock(url) {
        return globalThis.isBlock && globalThis.blockRules.some(e => url.includes(e));
    }

    // Наблюдение за заголовками (без "blocking", так как в Chrome MV3 это запрещено для обычных страниц)
    chrome.webRequest.onBeforeSendHeaders.addListener(
        function(details) {
            if (details.method === "POST") {
                globalThis.requests.push({
                    url: details.url,
                    headers: convertHeaders(details.requestHeaders),
                    body: globalThis.bodys.find((b) => b.id == details.requestId)?.body || ""
                });
            }
        },
        { urls: ["<all_urls>"] },
        ["requestHeaders"] 
    );

    // Наблюдение за телом запроса и перехват MPD
    chrome.webRequest.onBeforeRequest.addListener(
        function(details) {
            if (details.url.includes(".mpd") && !globalThis.mpds.includes(details.url)) {
                globalThis.mpds.push(details.url);
            }

            if (details.method === "POST" && details.requestBody) {
                globalThis.bodys.push({
                    body: details.requestBody.raw ? btoa(String.fromCharCode(...new Uint8Array(details.requestBody.raw[0]['bytes']))) : "",
                    id: details.requestId
                });
            }
        },
        { urls: ["<all_urls>"] },
        ["requestBody"]
    );

    chrome.runtime.onMessage.addListener(
        function (request, sender, sendResponse) {
            switch(request.type) {
                case "RESET":
                    // В Service Worker нельзя делать location.reload(), просто очищаем переменные
                    globalThis.psshs = [];
                    globalThis.requests = [];
                    globalThis.bodys = [];
                    globalThis.mpds = [];
                    globalThis.targetIds = [];
                    globalThis.pageURL = "";
                    globalThis.clearkey = "";
                    break;
                case "PSSH":
                    globalThis.psshs.push(request.text);
                    globalThis.pageURL = sender.tab ? sender.tab.url : "";
                    globalThis.targetIds = sender.tab ? [sender.tab.id, sender.frameId] : [];
                    break;
                case "CLEARKEY":
                    globalThis.clearkey = request.text;
                    break;
                case "FETCH":
                    // Асинхронный ответ требует return true
                    fetch(request.u, {
                        method: request.m,
                        headers: JSON.parse(request.h),
                        body: Uint8Array.from(atob(request.b), c => c.charCodeAt(0))
                    }).then((r) => r.arrayBuffer()).then((r) => {
                        sendResponse(btoa(String.fromCharCode(...new Uint8Array(r))));
                    }).catch((e) => {
                        sendResponse({ error: e.message });
                    });
                    return true; 
            }
        }
    );
})();

// Заменяем chrome.browserAction на chrome.action
chrome.action.onClicked.addListener(tab => {
    if (chrome.windows) {
        chrome.windows.create({
            url: "popup/main.html",
            type: "popup",
            width: 820,
            height: 600
        });
    } else {
        chrome.tabs.create({ url: 'popup/main.html' });
    }
});

function createMenu() {
    chrome.storage.local.set({ 'isBlock': false }, null);
    chrome.contextMenus.create({
        id: "toggleBlocking",
        title: "Enable License Blocking"
    });
}
chrome.runtime.onInstalled.addListener(createMenu);
chrome.runtime.onStartup.addListener(createMenu);

chrome.contextMenus.onClicked.addListener(item => {
    if (item.menuItemId == "toggleBlocking") {
        chrome.storage.local.get("isBlock", (value) => {
            const newBlockState = !value.isBlock;
            chrome.storage.local.set({ 'isBlock': newBlockState }, null);
            chrome.contextMenus.update("toggleBlocking", { 
                title: newBlockState ? "Disable License Blocking" : "Enable License Blocking" 
            });
            globalThis.isBlock = newBlockState;
            
            // ПРИМЕЧАНИЕ: Если вам нужна реальная блокировка запросов в Chrome MV3, 
            // здесь необходимо вызывать chrome.declarativeNetRequest.updateDynamicRules 
            // для добавления/удаления правил блокировки на основе globalThis.blockRules.
        });
    }
});