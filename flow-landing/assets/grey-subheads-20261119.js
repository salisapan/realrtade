/* 2026-11-19 · Option A is the default. ?sub=0 restores the previous look. */
(function(){
  var q = new URLSearchParams(location.search);
  var raw = q.get("sub");
  if (raw === "0" || raw === "now" || raw === "off") return;
  var sub = (raw || "A").toUpperCase();
  if (sub !== "A" && sub !== "B" && sub !== "C") sub = "A";

  var root = document.documentElement;
  if (root.getAttribute("data-sub") !== sub) root.setAttribute("data-sub", sub);
  if (!document.querySelector('link[href*="grey-subheads-20261119.css"]')){
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "assets/grey-subheads-20261119.css";
    document.head.appendChild(link);
  }

  function langOf(){ return (root.lang || "en").slice(0, 2); }

  var MAP = {
    hero: {
      en: { ink: "Intent", grey: "into", blue: "action" },
      he: { ink: "מכוונה", grey: "", blue: "לביצוע" },
      de: { ink: "Von der Absicht", grey: "zur", blue: "Tat" },
      fr: { ink: "De l’intention", grey: "à", blue: "l’action" },
      es: { ink: "De la intención", grey: "a la", blue: "acción" }
    },
    i1: {
      en: { ink: "You don’t ask Flow", grey: "It already knows", blue: "what’s next" },
      he: { ink: "לא צריך לבקש מ־Flow", grey: "היא כבר יודעת", blue: "מה הלאה" },
      de: { ink: "Sie müssen Flow nicht fragen", grey: "Es weiß bereits", blue: "was als Nächstes kommt" },
      fr: { ink: "Inutile de demander à Flow", grey: "Il sait déjà", blue: "ce qui vient ensuite" },
      es: { ink: "No le pides nada a Flow", grey: "Ya sabe", blue: "qué viene después" }
    },
    setup: {
      en: { ink: "From first call", grey: "to the whole", blue: "office" },
      he: { ink: "מהשיחה הראשונה", grey: "ועד כל", blue: "המשרד" },
      de: { ink: "So wird Flow", grey: "", blue: "eingerichtet" },
      fr: { ink: "Du premier appel", grey: "à tout", blue: "le bureau" },
      es: { ink: "De la primera llamada", grey: "a toda", blue: "la oficina" }
    },
    dp: {
      en: { ink: "Where", grey: "Flow", blue: "runs" },
      he: { ink: "איפה", grey: "Flow", blue: "רצה" },
      de: { ink: "Wo", grey: "Flow", blue: "läuft" },
      fr: { ink: "Où", grey: "Flow", blue: "s’exécute" },
      es: { ink: "Dónde", grey: "corre", blue: "Flow" }
    }
  };

  function norm(s){
    return String(s || "").replace(/\s+/g, " ").trim();
  }
  function span(cls, text){
    var s = document.createElement("span");
    s.className = cls;
    s.textContent = text;
    return s;
  }
  function fillThree(el, parts, useGrey){
    if (!el || !parts) return;
    var ink = parts.ink, grey = useGrey ? parts.grey : "", blue = parts.blue;
    el.setAttribute("data-gs", "1");
    el.textContent = "";
    if (ink) el.appendChild(span("gs-ink", ink));
    if (grey){
      el.appendChild(document.createTextNode(" "));
      el.appendChild(span("gs-grey", grey));
    }
    if (blue){
      el.appendChild(document.createTextNode(" "));
      el.appendChild(span("gs-blue", blue));
    }
  }
  function lastWordBlue(el, parts){
    if (!el || !parts) return;
    var ink = [parts.ink, parts.grey].filter(Boolean).join(" ");
    fillThree(el, { ink: ink, grey: "", blue: parts.blue }, false);
  }

  var applying = false;

  function heroB(){
    var h1 = document.getElementById("h1");
    if (!h1) return;
    var parts = MAP.hero[langOf()] || MAP.hero.en;
    var b = h1.querySelector(".wow-b");
    var a = h1.querySelector(".wow-a");
    if (!a || !b) return;
    if (h1.querySelector(".gs-grey") || (sub !== "B" && h1.getAttribute("data-gs") === "1")) return;
    if (sub !== "B") return;
    if (!parts.grey) return;
    var raw = norm(b.textContent);
    var expect = norm((parts.grey + " " + parts.blue).trim());
    if (raw !== expect && raw !== parts.blue) return;
    if (raw === parts.blue) return;
    applying = true;
    var g = span("gs-grey", parts.grey);
    b.parentNode.insertBefore(g, b);
    b.parentNode.insertBefore(document.createTextNode(" "), b);
    b.textContent = parts.blue;
    b.setAttribute("data-t", parts.blue);
    h1.setAttribute("data-gs", "1");
    applying = false;
  }

  function applyI1(){
    var h2 = document.getElementById("i1Title");
    if (!h2) return;
    var parts = MAP.i1[langOf()] || MAP.i1.en;
    var line1 = h2.querySelector('[data-i1="h1"]');
    var line2 = h2.querySelector('[data-i1="h2"]');
    if (!line2) return;
    var sig = sub + ":" + langOf() + ":" + norm(line1 ? line1.textContent : "") + "|" + norm(line2.textContent);
    if (h2.getAttribute("data-gs-sig") === sig && line2.querySelector(".gs-blue")) return;
    applying = true;
    if (sub === "B"){
      if (line1){
        line1.classList.add("gs-ink");
        line1.classList.remove("gs-grey");
      }
      var l2text = norm(line2.textContent);
      var expect = norm((parts.grey + " " + parts.blue).trim());
      if (!line2.querySelector(".gs-blue") && (l2text === expect || l2text.indexOf(parts.blue) >= 0)){
        line2.textContent = "";
        if (parts.grey){
          line2.appendChild(span("gs-grey", parts.grey));
          line2.appendChild(document.createTextNode(" "));
        }
        line2.appendChild(span("gs-blue", parts.blue));
      }
    } else {
      if (!line2.querySelector(".gs-blue")){
        var t = norm(line2.textContent);
        var expect2 = norm((parts.grey + " " + parts.blue).trim());
        if (t === expect2 || t.indexOf(parts.blue) >= 0){
          line2.textContent = "";
          if (parts.grey){
            line2.appendChild(document.createTextNode(parts.grey + " "));
          }
          line2.appendChild(span("gs-blue", parts.blue));
        }
      }
    }
    h2.setAttribute("data-gs-sig", sig);
    applying = false;
  }

  function applySimple(id, key){
    var el = document.getElementById(id);
    if (!el) return;
    var parts = MAP[key][langOf()] || MAP[key].en;
    var sig = sub + ":" + langOf() + ":" + norm(el.textContent);
    if (el.getAttribute("data-gs-sig") === sig && el.querySelector(".gs-blue")) return;
    var current = norm(el.textContent);
    var full = norm([parts.ink, parts.grey, parts.blue].filter(Boolean).join(" "));
    if (current !== full && current !== norm(parts.ink + " " + parts.blue)){
      return;
    }
    applying = true;
    if (sub === "B") fillThree(el, parts, true);
    else lastWordBlue(el, parts);
    el.setAttribute("data-gs-sig", sub + ":" + langOf() + ":" + norm(el.textContent));
    applying = false;
  }

  function applyCreed(){
    var el = document.getElementById("crH");
    if (!el) return;
    if (!el.querySelector("em")) return;
    var sig = sub + ":" + langOf() + ":" + norm(el.textContent);
    if (el.getAttribute("data-gs-sig") === sig && el.getAttribute("data-gs") === "1") return;
    applying = true;
    var html = el.innerHTML;
    var chunks = html.split(/<br\s*\/?>/i);
    if (chunks.length >= 3 && sub === "B"){
      el.innerHTML =
        '<span class="gs-ink">' + chunks[0].trim() + "</span><br>" +
        '<span class="gs-grey">' + chunks[1].trim() + "</span><br>" +
        chunks.slice(2).join("<br>");
    } else if (chunks.length >= 2 && sub !== "B"){
      el.innerHTML =
        '<span class="gs-ink">' + chunks.slice(0, -1).join("<br>") + "</span><br>" +
        chunks[chunks.length - 1];
    }
    el.setAttribute("data-gs", "1");
    el.setAttribute("data-gs-sig", sub + ":" + langOf() + ":" + norm(el.textContent));
    applying = false;
  }

  function applySetupLead(){
    if (sub !== "A") return;
    var el = document.querySelector("#setup .sec-h .lead");
    if (!el) return;
    if (el.querySelector(".gs-sent")) return;
    var text = norm(el.textContent);
    if (!text) return;
    var parts = text.split(/(?<=[.。])\s+/);
    if (parts.length < 2) return;
    var sig = "lead:" + langOf() + ":" + text;
    if (el.getAttribute("data-gs-lead") === sig) return;
    applying = true;
    el.textContent = "";
    parts.forEach(function(p, i){
      if (i) el.appendChild(document.createTextNode(" "));
      el.appendChild(span("gs-sent", p));
    });
    el.setAttribute("data-gs-lead", sig);
    applying = false;
  }


  function fitI1Line2(){
    if (sub !== "A") return;
    var line2 = document.querySelector("#i1Title [data-i1='h2']");
    if (!line2) return;
    var ln = line2.closest(".i1-ln") || line2;
    ln.classList.remove("gs-end");
    var cs = window.getComputedStyle(document.getElementById("i1Title") || line2);
    var probe = document.createElement("span");
    probe.style.cssText = "position:absolute;visibility:hidden;white-space:nowrap;font:"+cs.font+";letter-spacing:"+cs.letterSpacing+";font-size:"+cs.fontSize;
    probe.textContent = (line2.textContent || "").replace(/\s+/g, " ").trim();
    document.body.appendChild(probe);
    var need = probe.getBoundingClientRect().width;
    probe.remove();
    var room = (ln.getBoundingClientRect().width) || line2.getBoundingClientRect().width;
    if (need > room + 1) ln.classList.add("gs-end");
  }

  function applyAll(){
    if (applying) return;
    heroB();
    applyI1();
    applySimple("obTitle", "setup");
    applySimple("dpTitle", "dp");
    applyCreed();
    applySetupLead();
    fitI1Line2();
  }

  function arm(){
    applyAll();
    var mo = new MutationObserver(function(){
      if (applying) return;
      applyAll();
    });
    ["h1", "i1Title", "obTitle", "dpTitle", "crH"].forEach(function(id){
      var el = document.getElementById(id);
      if (el) mo.observe(el, { childList: true, characterData: true, subtree: true });
    });
    var lead = document.querySelector("#setup .sec-h .lead");
    if (lead) mo.observe(lead, { childList: true, characterData: true, subtree: true });
    mo.observe(root, { attributes: true, attributeFilter: ["lang", "dir"] });
    addEventListener("resize", function(){ fitI1Line2(); }, { passive: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arm);
  else arm();
  setTimeout(applyAll, 200);
  setTimeout(applyAll, 800);
  setTimeout(applyAll, 1600);
})();
