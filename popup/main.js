let psshs = chrome.extension.getBackgroundPage().psshs;
let requests = chrome.extension.getBackgroundPage().requests;
let pageURL = chrome.extension.getBackgroundPage().pageURL;
let targetIds = chrome.extension.getBackgroundPage().targetIds;
let clearkey = chrome.extension.getBackgroundPage().clearkey;
let mpds = chrome.extension.getBackgroundPage().mpds; // <-- ДОБАВЛЕНО: массив с MPD URL

function saveKeyToFile(resultText, pssh, licUrl, schemeName, streamUrl) {
    if (!resultText || resultText.trim() === "") return;
    
    const content = `=============================================
Widevine L3 Decryption Info
Date: ${new Date().toLocaleString()}
Service/Scheme: ${schemeName || 'Unknown'}
---------------------------------------------
Stream/MPD:     ${streamUrl || 'N/A'}
License URL:    ${licUrl || 'N/A'}
PSSH:           ${pssh || 'N/A'}
DECRYPTION KEY(S):
${resultText.trim()}
=============================================\n\n`;


    const filename = `widevine_key.txt`;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 100);
}

async function guess(){
    //Be patient!
    document.body.style.cursor = "wait";
    document.getElementById("guess").disabled = true;

    //Init Pyodide
    let pyodide = await loadPyodide();
    await pyodide.loadPackage(["certifi-2024.2.2-py3-none-any.whl","charset_normalizer-3.3.2-py3-none-any.whl","construct-2.8.8-py2.py3-none-any.whl","idna-3.6-py3-none-any.whl","packaging-23.2-py3-none-any.whl","protobuf-4.24.4-cp312-cp312-emscripten_3_1_52_wasm32.whl","pycryptodome-3.20.0-cp35-abi3-emscripten_3_1_52_wasm32.whl","pymp4-1.4.0-py3-none-any.whl","pyodide_http-0.2.1-py3-none-any.whl","pywidevine-1.8.0-py3-none-any.whl","requests-2.31.0-py3-none-any.whl","urllib3-2.2.1-py3-none-any.whl"].map(e=>"/libs/wheels/"+e))

    //Configure Guesser
    pyodide.globals.set("pssh", document.getElementById('pssh').value);
    
    // Безопасное получение URL лицензии (на случай, если массив пуст)
    const currentReq = requests[userInputs['license']];
    pyodide.globals.set("licUrl", currentReq ? currentReq['url'] : "");
    pyodide.globals.set("licHeaders", currentReq ? currentReq['headers'] : "");
    pyodide.globals.set("licBody", currentReq ? currentReq['body'] : "");
    
    let pre = await fetch('/python/pre.py').then(res=>res.text())
    let after = await fetch('/python/after.py').then(res=>res.text())
    let scheme = document.getElementById("schemeCode").value

    //Get result
    let result = await pyodide.runPythonAsync([pre, scheme, after].join("\n"));
    document.getElementById('result').value = result;

    // >>> АВТОМАТИЧЕСКОЕ СОХРАНЕНИЕ В ФАЙЛ С URL СТРИМА <<<
    const currentScheme = document.getElementById("schemeSelect").value;
    const currentLicUrl = currentReq ? currentReq['url'] : 'N/A';
    const currentPssh = document.getElementById('pssh').value;
    
    // Берем последний найденный MPD. Если массив пуст, используем URL страницы
    const streamUrl = (mpds && mpds.length > 0) ? mpds[mpds.length - 1] : pageURL;
    
    saveKeyToFile(result, currentPssh, currentLicUrl, currentScheme, streamUrl);

    //Save history
    let historyData = {
        PSSH: document.getElementById('pssh').value,
        KEYS: result.split("\n").slice(0,-1)
    }
    chrome.storage.local.set({[pageURL]: historyData}, null);

    //All Done!
    document.body.style.cursor = "auto";
    document.getElementById("guess").disabled = false;
}

function copyResult(){
    this.select();
    navigator.clipboard.writeText(this.value);
}

window.corsFetch = (u, m, h, b) => {
    return new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(targetIds[0], {type:"FETCH", u:u, m:m, h:h, b:b}, {frameId:targetIds[1]}, res => {
            resolve(res)
        })
    })
}

async function autoSelect(){
    userInputs["license"] = 0;
    document.getElementById("license").value = requests[0] ? requests[0]['url'] : '';
    document.getElementById('pssh').value = psshs[0] || '';
    
    let selectRules = await fetch("/selectRules.conf").then((r)=>r.text());
    selectRules = selectRules.replace(/\n^\s*$|\s*\/\/.*|\s*$/gm, "");
    selectRules = selectRules.split("\n").map(row => row.split("$$"));
    for(var item of selectRules){
        let search = requests.map(r => r['url']).findIndex(e => e.includes(item[0]));
        if(search >= 0){
            if(item[1]) document.getElementById("schemeSelect").value = item[1];
            userInputs["license"] = search;
            document.getElementById("license").value = requests[search]['url'];
            break;
        }
    }

    document.getElementById("schemeSelect").dispatchEvent(new Event("input"))
}

if (clearkey) {
    document.getElementById('noEME').style.display = 'none';
    document.getElementById('ckHome').style.display = 'grid';
    document.getElementById('ckResult').value = clearkey;
    document.getElementById('ckResult').addEventListener("click", copyResult);
} else if (psshs.length) {
    document.getElementById('noEME').style.display = 'none';
    document.getElementById('home').style.display = 'grid';
    document.getElementById('guess').addEventListener("click", guess);
    document.getElementById('result').addEventListener("click", copyResult);
    autoSelect();
}