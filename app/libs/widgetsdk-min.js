var ZSDKUtil = function (f) {
    function c() { } function g(d) { var b = {}; d = d || window.location.href; return d.substr(d.indexOf("?") + 1).split("\x26").forEach(function (d) { d = d.split("\x3d"); b[d[0]] = d[1] }), b.hasOwnProperty("serviceOrigin") && (b.serviceOrigin = decodeURIComponent(b.serviceOrigin)), b } var l, e = g(); return c.prototype.Info = function () { (f.isDevMode() || f.isLogEnabled()) && console.info.apply(console, arguments) }, c.prototype.Error = console.error, f.GetQueryParams = g, f.isDevMode = function () { return e && e.isDevMode }, f.isLogEnabled =
        function () { return e && e.isLogEnabled }, f.getLogger = function () { return l && l instanceof c || (l = new c), l }, f
}(window.ZSDKUtil || {}), ZSDKMessageManager = function (f) {
    function c(a) {
        try { var b = "string" == typeof a.data ? JSON.parse(a.data) : a.data } catch (t) { b = a.data } var c = b.type; try {
            var l; if (!(l = "__REGISTER__" === c)) { var m = a.source, f = a.origin; l = !(!k.isRegistered() || n !== m || u !== f) || Error("Un-Authorized Message.") } if (l) switch (c) {
                case "__REGISTER__": a = b; n = window.parent; u = v.serviceOrigin; k.dcType = window.location.origin.split(".").pop().toUpperCase();
                    "COM" === k.dcType && (k.dcType = "US"); k.key = a.uniqueID; k.parentWindow = n; k._isRegistered = !0; d({ type: "__REGISTER__", widgetOrigin: h(), uniqueID: k.key }, k); e(k, "Load", a.data); break; case "__EVENT_RESPONSE__": var q = b.promiseID, r = b.data, x = b.isSuccess; p.hasOwnProperty(q) && (x ? p[q].resolve(r) : p[q].reject(r), p[q] = void 0, delete p[q]); break; default: g(a, b)
            }
        } catch (t) { y.Error("[SDK.MessageHandler] \x3d\x3e ", t.stack) }
    } function g(a, b) {
        var d = b.widgetID; a = b.eventName; if (k.key === d) var h = e(k, a, b.data); else {
            var c = k._childWidgets[d];
            c && (h = e(c, a, b.data))
        } if (b.isPromise) { var n = {}; Promise.all(h).then(function (a) { n.response = a; n.widgetID = d; n.sourceWidgetID = k.key; l(b, n) }).catch(function (a) { n.response = a; n.widgetID = d; n.sourceWidgetID = k.key; l(b, n) }) }
    } function l(a, b) { d({ type: "__EVENT_RESPONSE__", widgetOrigin: h(), uniqueID: k.key, eventName: a.eventName, data: b, promiseID: a.promiseID }, k) } function e(a, b, k) {
        b = a.eventHandlers[b]; var d = []; if (Array.isArray(b)) for (var h = 0; h < b.length; h++) {
            try {
                var n = b[h].call(a, k); var c = n instanceof Promise ? n.then(function (a) {
                    return {
                        isSuccess: !0,
                        response: a
                    }
                }).catch(function (a) { return { isSuccess: !1, response: a } }) : { isSuccess: !0, response: n }
            } catch (w) { c = { isSuccess: !1, response: w } } d.push(c)
        } return d
    } function d(k, d) { var h, n = k.isPromise; if (n && (h = "Promise" + r++, k.promiseID = h), d && (k.uniqueID = (d.parentWidget || d).key, k.widgetID = d.key), k.time = (new Date).getTime(), a(k), n) return b(h) } function b(a) { return new Promise(function (b, k) { p[a] = { resolve: b, reject: k, time: (new Date).getTime() } }) } function m() { a({ type: "__DEREGISTER__", uniqueID: k.key }) } function a(a) {
        if ("object" ==
            typeof a && (a.widgetOrigin = encodeURIComponent(h())), !n) throw Error("Parentwindow reference not found."); n.postMessage(a, v.serviceOrigin)
    } function h() { return window.location.protocol + "//" + window.location.host + window.location.pathname } var k, n, u, y = ZSDKUtil.getLogger(), r = 100, p = {}, v = ZSDKUtil.GetQueryParams(); return f.Init = function (a) { k = a; window.addEventListener("message", c); window.addEventListener("unload", m) }, f.SendEvent = d, f
}(window.ZSDKMessageManager || {});
window.ZSDK = function () {
    function f(c) { this.serviceOrigin = c.serviceOrigin || g.serviceOrigin; this.parentWidget = c.parentWidget; this.key = c.key; this._isRegistered = !1; this._childWidgets = {}; this.eventHandlers = Object.create(null); this.meta } var c, g = ZSDKUtil.GetQueryParams(); return f.prototype.on = function (c, e) {
        if ("string" != typeof c) throw Error("Invalid eventname parameter passed."); if ("function" != typeof e) throw Error("Invalid function parameter passed."); var d = this.eventHandlers[c]; if (Array.isArray(d) || (this.eventHandlers[c] =
            d = []), d.push(e), "Load" !== c) { var b = { type: "__EVENT_BIND__", eventName: c, count: d.length }; this.parentWidget && !this.parentWidget.isRegistered() || !this.parentWidget && !this.isRegistered() ? (this.parentWidget || this).on("Load", function () { ZSDKMessageManager.SendEvent(b, this) }) : ZSDKMessageManager.SendEvent(b, this) }
    }, f.prototype.off = function (c, e) {
        if ("string" != typeof c) throw Error("Invalid eventname parameter passed."); if ("function" != typeof e) throw Error("Invalid function parameter passed."); c = this.eventHandlers[c];
        if (Array.isArray(c)) { var d, b = []; for (d = 0; d < c.length; d++)c[d] === e && b.push(d); for (; b.length;)c.splice(b.pop(), 1) }
    }, f.prototype._sendEvent = function (c, e, d) { 
        return ZSDKMessageManager.SendEvent(
            { 
                type: "__EVENT__", eventName: c, data: e, isPromise: d 
            }, this
        ) 
    }, f.prototype.emit = function (c, e) { ZSDKMessageManager.SendEvent({ type: "__EMIT__", eventName: c, data: e }, this) }, f.prototype.isRegistered = function () { return this._isRegistered }, f.prototype.fetch = function (c) {
        return ZSDKMessageManager.SendEvent({
            eventName: "__HTTP__", isPromise: !0,
            options: c
        }, this)
    }, f.prototype.createInstance = function (c) { return ZSDKMessageManager.SendEvent({ eventName: "__CREATE_INSTANCE__", isPromise: !0, options: c }, this) }, f.prototype.modal = function (c) { return "object" == typeof c && (c.location = "__MODAL__"), this.createInstance(c) }, f.prototype.getWidgets = function () { return ZSDKMessageManager.SendEvent({ eventName: "__WIDGETS_INFO__", isPromise: !0 }, this) }, f.prototype.getWidgetInstance = function (c) {
        if ("string" != typeof c) throw Error("Invalid WidgetID passed"); if (this.parentWidget) return this.parentWidget.getWidgetInstance(c);
        var e = this._childWidgets[c]; return e || (this._childWidgets[c] = e = new f({ key: c, parentWidget: this })), e
    }, f.prototype.getFileObject = function (c) { return new File([c.slice(0, c.size)], c.name, { type: c.type }) }, { Init: function () { return c || (c = new f({ serviceOrigin: g.serviceOrigin }), ZSDKMessageManager.Init(c), c) }, _getRootInstance: function () { return c } }
}();
window.SigmaSDK = function () {
    function f(b) { this._serviceName = b } var c, g = function () { if (!c.isRegistered()) throw Error("App not registered."); }, l = function (b, d) { return c._sendEvent("SIGMA_" + b + "_EVENT", d, !0) }, e = function (b, c) { return Promise.reject({ type: b, message: c }) }; f.prototype.isRegistered = function () { return c.isRegistered() }; f.prototype.context = function () { return g(), c }; f.prototype.createWidget = function (b) { return g(), c.createInstance(b) }; f.prototype.getWidget = function (b) { return c.getWidgetInstance(b) }; f.prototype.widgetsMeta =
        function () { return g(), c.getWidgets() }; f.prototype.on = function (b, d) { return c.on(b, d) }; f.prototype.off = function (b, d) { return c.off(b, d) }; f.prototype.trigger = function (b, d) { return g(), c.emit(b, d) }; f.prototype.modal = function (b) { return g(), c.modal(b) }; f.prototype.fetch = function (b) { return g(), c.fetch(b) }; f.prototype.get = function (b, d) {
            if (g(), "string" != typeof b && !Array.isArray(b)) return e("VALIDATION_ERROR", "The get method accepts String or Array of Strings only."); b = "string" == typeof b ? [b] : b; if (0 >= b.length) return e("VALIDATION_ERROR",
                "The get method should not accept empty Array of Strings."); b = { event_type: "get", properties: b }; return "function" == typeof d && c.on("get", d), l(this._serviceName, b)
        }; f.prototype.getAll = function (b, d, a) { if (g(), "string" != typeof b) return e("VALIDATION_ERROR", "The getAll method accepts module_name as String only."); b = { event_type: "get_all", module_name: b, options: d }; return "function" == typeof a && c.on("get_all", a), l(this._serviceName, b) }; f.prototype.set = function (b, d, a) {
            if (g(), "string" != typeof b && "object" != typeof b &&
                Array.isArray(b)) return e("VALIDATION_ERROR", "The set method accepts key-value pair or Object of key-value pairs only."); var h; if ("string" == typeof b ? (h = {}, h[b] = d) : h = b, 0 >= h.length) return e("VALIDATION_ERROR", "The set method should not accept empty Object."); b = { event_type: "set", properties: h }; return "function" == typeof a && c.on("set", a), l(this._serviceName, b)
        }; f.prototype.remove = function (b, d) {
            if (g(), "string" != typeof b && !Array.isArray(b)) return e("VALIDATION_ERROR", "The remove method accepts String or Array of Strings only.");
            b = "string" == typeof b ? [b] : b; if (0 >= b.length) return e("VALIDATION_ERROR", "The remove method should not accept empty Array of Strings."); b = { event_type: "remove", properties: b }; return "function" == typeof d && c.on("remove", d), l(this._serviceName, b)
        }; f.prototype.request = function (b, d) {
            if (g(), !b.url || 0 >= b.url.trim().length) return e("VALIDATION_ERROR", "The parameter url should not be empty"); if ("string" != typeof b.url) return e("VALIDATION_ERROR", "The parameter url should be type of string"); if (b.method || (b.method =
                "GET"), b.params && "object" != typeof b.params && Array.isArray(b.params)) return e("VALIDATION_ERROR", "The parameter params should be type of object"); if (b.headers && "object" != typeof b.headers && Array.isArray(b.headers)) return e("VALIDATION_ERROR", "The parameter headers should be type of object"); if (b.files) if (Array.isArray(b.files)) for (var a = 0; a < b.files.length; a++)b.files[a] = c.getFileObject(b.files[a]); else {
                    if ("object" != typeof b.files) return e("VALIDATION_ERROR", "The parameter files should be type of object");
                    if (5 < Object.keys(b.files).length) return e("VALIDATION_ERROR", "You can upload a maximum of 5 files at a time.")
                } b = { event_type: "request", options: b }; return "function" == typeof d && c.on("request", d), l(this._serviceName, b)
        }; f.prototype.requestapiconnection = function (b, d) {
            if (g(), !b.api_namespace || 0 >= b.api_namespace.trim().length) return e("VALIDATION_ERROR", "The parameter api_namespace should not be empty"); if ("string" != typeof b.api_namespace) return e("VALIDATION_ERROR", "The parameter api_namespace should be type of string");
            if (!b.url || 0 >= b.url.trim().length) return e("VALIDATION_ERROR", "The parameter url should not be empty"); if ("string" != typeof b.url) return e("VALIDATION_ERROR", "The parameter url should be type of string"); if (b.method || (b.method = "GET"), b.params && "object" != typeof b.params && Array.isArray(b.params)) return e("VALIDATION_ERROR", "The parameter params should be type of object"); if (b.headers && "object" != typeof b.headers && Array.isArray(b.headers)) return e("VALIDATION_ERROR", "The parameter headers should be type of object");
            if (b.files) if (Array.isArray(b.files)) for (var a = 0; a < b.files.length; a++)b.files[a] = c.getFileObject(b.files[a]); else { if ("object" != typeof b.files) return e("VALIDATION_ERROR", "The parameter files should be type of object"); if (5 < Object.keys(b.files).length) return e("VALIDATION_ERROR", "You can upload a maximum of 5 files at a time.") } b = { event_type: "requestapiconnection", options: b }; return "function" == typeof d && c.on("requestapiconnection", d), l(this._serviceName, b)
        }; f.prototype.dispatch = function (b, d, a) {
            g();
            d = { event_type: b, options: d }; return "function" == typeof a && c.on(b, a), l(this._serviceName, d)
        }; var d = function (b) { return c = window.ZSDK.Init(), "function" == typeof b && (c.isRegistered() ? b.call() : c.on("Load", b)), new f(this._serviceName) }; return {
            CRM: { init: d.bind({ _serviceName: "CRM" }) }, DESK: { init: d.bind({ _serviceName: "DESK" }) }, PROJECTS: { init: d.bind({ _serviceName: "PROJECTS" }) }, ORCHESTLY: { init: d.bind({ _serviceName: "ORCHESTLY" }) }, MAIL: { init: d.bind({ _serviceName: "MAIL" }) }, SHOW: { init: d.bind({ _serviceName: "SHOW" }) },
            SDP: { init: d.bind({ _serviceName: "SDP" }) }, IOT: { init: d.bind({ _serviceName: "IOT" }) }, ZAPPS: { init: d.bind({ _serviceName: "ZAPPS" }) }, CATALYST: { init: d.bind({ _serviceName: "CATALYST" }) }, FINANCE: { init: d.bind({ _serviceName: "FINANCE" }) }, CONNECT: { init: d.bind({ _serviceName: "CONNECT" }) }, TEAMINBOX: { init: d.bind({ _serviceName: "TEAMINBOX" }) }, SPRINTS: { init: d.bind({ _serviceName: "SPRINTS" }) }, BUGTRACKER: { init: d.bind({ _serviceName: "BUGTRACKER" }) }, CREATOR: { init: d.bind({ _serviceName: "CREATOR" }) }, PEOPLE: { init: d.bind({ _serviceName: "PEOPLE" }) },
            COMMERCE: { init: d.bind({ _serviceName: "COMMERCE" }) }, SITES: { init: d.bind({ _serviceName: "SITES" }) }, RECRUIT: { init: d.bind({ _serviceName: "RECRUIT" }) }, WORKDRIVE: { init: d.bind({ _serviceName: "WORKDRIVE" }) }, WRITER: { init: d.bind({ _serviceName: "WRITER" }) }, INVOICE: { init: d.bind({ _serviceName: "INVOICE" }) }, INVENTORY: { init: d.bind({ _serviceName: "INVENTORY" }) }, SUBSCRIPTIONS: { init: d.bind({ _serviceName: "SUBSCRIPTIONS" }) }, CAMPAIGNS: { init: d.bind({ _serviceName: "CAMPAIGNS" }) }, CHARMHEALTHEHR: { init: d.bind({ _serviceName: "CHARMHEALTHEHR" }) },
            BIGIN: { init: d.bind({ _serviceName: "BIGIN" }) }, EXPENSE: { init: d.bind({ _serviceName: "EXPENSE" }) }, FSM: { init: d.bind({ _serviceName: "FSM" }) }
        }
}(); var ZOHO = new function () { _self = this; var f = new ZSDK.Init, c = void 0, g = { appSDK: f }, l; c = new Promise(function (c, d) { l = c }); f.on("Load", function (c) { g.widgetParams = c.widgetmeta; f._sendEvent("GET_INIT_PARAMS", !0, !0).then(function (c) { g.initParams = c; f._sendEvent("GET_QUERY_PARAMS", !0, !0).then(function (b) { g.queryParams = b; l(g) }) }) }); return { CREATOR: { DATA: new Records(g, c, "DATA", "V2_1"), META: new Records(g, c, "META", "V2_1"), FILE: new Records(g, c, "FILE", "V2_1"), PUBLISH: new Records(g, c, "PUBLISH", "V2_1"), UTIL: new Util(g, c) } } };
function Records(f, c, g, l) {
    function e(a) { a.workspace_name || (a.workspace_name = f.initParams.scope); a.envUrlFragment || (a.envUrlFragment = f.initParams.envUrlFragment.substr(1)); a.app_name || (a.app_name = f.initParams.appLinkName); a.version = l } function d(a, b) { var c = !1, d; for (d in a) { var h; if (h = !(b && b.includes(d))) { h = a[d]; var e = !1, f; if (!(f = !h || null == h || "" === h || "string" == typeof h && 0 == h.trim().length) && (f = "object" == typeof h)) a: { f = void 0; for (f in h) { f = !1; break a } f = !0 } f && (e = !0); h = e } h && (c = !0) } return c } function b(a) {
        return new Promise(function (b,
            c) { var d = new FileReader; d.readAsDataURL(a); d.onload = function () { b(d.result) }; d.onerror = function (a) { c(a) } })
    } var m = {}; switch (g) {
        case "DATA": m.addRecords = function (a) { return d(a) ? new Promise(function (a, b) { b("Improper Configuration..!!") }) : new Promise(function (b, d) { c.then(function (c) { e(a); b(c.appSDK._sendEvent("API_OPERATION", { scopeName: a.workspace_name, appLinkName: a.app_name, formLinkName: a.form_name, body: a.payload, version: a.version, operation: "ADD_RECORD" }, !0)) }) }) }; m.updateRecordById = function (a) {
            return d(a) ?
                new Promise(function (a, b) { b("Improper Configuration..!!") }) : new Promise(function (b, d) { c.then(function (c) { e(a); b(c.appSDK._sendEvent("API_OPERATION", { scopeName: a.workspace_name, appLinkName: a.app_name, viewLinkName: a.report_name, id: a.id, body: a.payload, version: a.version, operation: "EDIT_RECORD" }, !0)) }) })
        }; m.updateRecords = function (a) {
            return d(a) ? new Promise(function (a, b) { b("Improper Configuration..!!") }) : new Promise(function (b, d) {
                c.then(function (c) {
                    e(a); b(c.appSDK._sendEvent("API_OPERATION", {
                        scopeName: a.workspace_name,
                        appLinkName: a.app_name, viewLinkName: a.report_name, processUntilLimit: a.process_until_limit, body: a.payload, version: a.version, operation: "EDIT_RECORDS"
                    }, !0))
                })
            })
        }; m.deleteRecordById = function (a) { return d(a) ? new Promise(function (a, b) { b("Improper Configuration..!!") }) : new Promise(function (b, d) { c.then(function (c) { e(a); b(c.appSDK._sendEvent("API_OPERATION", { scopeName: a.workspace_name, appLinkName: a.app_name, viewLinkName: a.report_name, id: a.id, body: a.payload, version: a.version, operation: "DELETE_RECORD" }, !0)) }) }) };
            m.deleteRecords = function (a) { return d(a) ? new Promise(function (a, b) { b("Improper Configuration..!!") }) : new Promise(function (b, d) { c.then(function (c) { e(a); b(c.appSDK._sendEvent("API_OPERATION", { scopeName: a.workspace_name, appLinkName: a.app_name, viewLinkName: a.report_name, processUntilLimit: a.process_until_limit, body: a.payload, version: a.version, operation: "DELETE_RECORDS" }, !0)) }) }) }; m.getRecordById = function (a) {
                return d(a) ? new Promise(function (a, b) { b("Improper Configuration..!!") }) : new Promise(function (b, d) {
                    c.then(function (c) {
                        e(a);
                        b(c.appSDK._sendEvent("API_OPERATION", { scopeName: a.workspace_name, appLinkName: a.app_name, viewLinkName: a.report_name, id: a.id, fieldConfig: a.field_config, fields: a.fields, version: a.version, operation: "GET_RECORD" }, !0))
                    })
                })
            }; m.getRecords = function (a) {
                return d(a, ["criteria", "max_records", "record_cursor", "field_config", "fields"]) ? new Promise(function (a, b) { b("Improper Configuration..!!") }) : new Promise(function (b, d) {
                    c.then(function (c) {
                        e(a); b(c.appSDK._sendEvent("API_OPERATION", {
                            scopeName: a.workspace_name, appLinkName: a.app_name,
                            viewLinkName: a.report_name, criteria: a.criteria, maxRecords: a.max_records, recordCursor: a.record_cursor, fieldConfig: a.field_config, fields: a.fields, version: a.version, operation: "GET_RECORDS"
                        }, !0))
                    })
                })
            }; m.getRecordCount = function (a) {
                return d(a) ? new Promise(function (a, b) { b("Improper Configuration..!!") }) : new Promise(function (b, d) {
                    c.then(function (c) {
                        e(a); b(c.appSDK._sendEvent("API_OPERATION", {
                            scopeName: a.workspace_name, appLinkName: a.app_name, viewLinkName: a.report_name, criteria: a.criteria, version: a.version,
                            operation: "GET_COUNT"
                        }, !0))
                    })
                })
            }; m.invokeCustomApi = function (a) { return d(a) ? new Promise(function (a, b) { b("Improper Configuration..!!") }) : new Promise(function (b, d) { c.then(function (c) { e(a); b(c.appSDK._sendEvent("USER_API_OPERATION", { apiLinkName: a.api_name, scopeName: a.workspace_name, method: a.http_method, contentType: a.content_type, payload: a.payload, queryParams: a.query_params, publickey: a.public_key, operation: "CUSTOM_API" }, !0)) }) }) }; m.invokeAISkill = function (a) {
                return d(a) ? new Promise(function (a, b) { b("Improper Configuration..!!") }) :
                    new Promise(function (b, d) { c.then(function (c) { e(a); b(c.appSDK._sendEvent("USER_API_OPERATION", { aiSkillName: a.ai_skill_name, scopeName: a.workspace_name, method: a.http_method, contentType: a.content_type, payload: a.payload, queryParams: a.query_params, publickey: a.public_key, operation: "AI_SKILL" }, !0)) }) })
            }; break; case "FILE": m.uploadFile = function (a) {
                if (d(a, ["file", "parent_id"]) || !a.file) return new Promise(function (a, b) { b("Improper Configuration..!!") }); var h = new Promise(function (c, d) {
                    var e = b(a.file), k = "", h = a.file.name;
                    e.then(function (b) { k = b; b = { scopeName: a.workspace_name, appLinkName: a.app_name, viewLinkName: a.report_name, id: a.id, fieldName: a.field_name, file: k, fileName: h, version: a.version, operation: a.parent_id ? "UPLD_SBFRM_FLE" : "UPLOAD_FILE" }; a.parent_id && (b.parentId = a.parent_id); f.appSDK._sendEvent("UPLOAD_FILE", b, !0).then(function (a) { c(a) }).catch(function (a) { d(a) }) }).catch(function (a) { d(a) })
                }); return new Promise(function (b, d) { c.then(function (c) { e(a); b(h) }) })
            }; m.readFile = function (a) {
                return d(a) ? new Promise(function (a,
                    b) { b("Improper Configuration..!!") }) : new Promise(function (b, d) { c.then(function (c) { e(a); var d = { scopeName: a.workspace_name, appLinkName: a.app_name, viewLinkName: a.report_name, id: a.id, fieldName: a.field_name, filePath: a.file_path, version: a.version, operation: a.parent_id ? "READ_SBFRM_FLE" : "READ_FILE" }; a.parent_id && (d.parentId = a.parent_id); b(c.appSDK._sendEvent("API_OPERATION", d, !0)) }) })
            }; break; case "META": m.getFields = function (a) {
                return d(a) ? new Promise(function (a, b) { b("Improper Configuration..!!") }) : new Promise(function (b,
                    d) { c.then(function (c) { e(a); b(c.appSDK._sendEvent("API_OPERATION", { scopeName: a.workspace_name, appLinkName: a.app_name, formLinkName: a.form_name, operation: "GET_FIELDS", version: a.version }, !0)) }) })
            }; m.getForms = function (a) { a || (a = {}); return d(a) ? new Promise(function (a, b) { b("Improper Configuration..!!") }) : new Promise(function (b, d) { c.then(function (c) { e(a); b(c.appSDK._sendEvent("API_OPERATION", { scopeName: a.workspace_name, appLinkName: a.app_name, operation: "GET_FORMS", version: a.version }, !0)) }) }) }; m.getReports =
                function (a) { a || (a = {}); return d(a) ? new Promise(function (a, b) { b("Improper Configuration..!!") }) : new Promise(function (b, d) { c.then(function (c) { e(a); b(c.appSDK._sendEvent("API_OPERATION", { scopeName: a.workspace_name, appLinkName: a.app_name, operation: "GET_REPORTS", version: a.version }, !0)) }) }) }; m.getPages = function (a) {
                    a || (a = {}); return d(a) ? new Promise(function (a, b) { b("Improper Configuration..!!") }) : new Promise(function (b, d) {
                        c.then(function (c) {
                            e(a); b(c.appSDK._sendEvent("API_OPERATION", {
                                scopeName: a.workspace_name,
                                appLinkName: a.app_name, operation: "GET_PAGES", version: a.version
                            }, !0))
                        })
                    })
                }; m.getSections = function (a) { a || (a = {}); return d(a) ? new Promise(function (a, b) { b("Improper Configuration..!!") }) : new Promise(function (b, d) { c.then(function (c) { e(a); b(c.appSDK._sendEvent("API_OPERATION", { scopeName: a.workspace_name, appLinkName: a.app_name, operation: "GET_SECTIONS", version: a.version }, !0)) }) }) }; m.getApplications = function () {
                    var a = {}; return new Promise(function (b, d) {
                        c.then(function (c) {
                            e(a); b(c.appSDK._sendEvent("API_OPERATION",
                                { operation: "GET_APPS", version: a.version }, !0))
                        })
                    })
                }; m.getApplicationsByWorkspace = function (a) { a || (a = {}); return new Promise(function (b, d) { c.then(function (c) { e(a); b(c.appSDK._sendEvent("API_OPERATION", { scopeName: a.workspace_name, operation: "GET_APPS_BY_WORKSPACE", version: a.version }, !0)) }) }) }; break; case "PUBLISH": m.addRecords = function (a) {
                    return d(a) ? new Promise(function (a, b) { b("Improper Configuration..!!") }) : new Promise(function (b, d) {
                        c.then(function (c) {
                            e(a); b(c.appSDK._sendEvent("API_OPERATION", {
                                scopeName: a.workspace_name,
                                appLinkName: a.app_name, formLinkName: a.form_name, privatelink: a.private_link, body: a.payload, version: a.version, operation: "ADD_RECORD_PUBLISH"
                            }, !0))
                        })
                    })
                }, m.getRecordById = function (a) {
                    return d(a) ? new Promise(function (a, b) { b("Improper Configuration..!!") }) : new Promise(function (b, d) {
                        c.then(function (c) {
                            e(a); b(c.appSDK._sendEvent("API_OPERATION", {
                                scopeName: a.workspace_name, appLinkName: a.app_name, viewLinkName: a.report_name, privatelink: a.private_link, id: a.id, fieldConfig: a.field_config, fields: a.fields, version: a.version,
                                operation: "GET_RECORD_PUBLISH"
                            }, !0))
                        })
                    })
                }, m.getRecords = function (a) {
                    return d(a, ["criteria", "max_records", "record_cursor", "field_config", "fields"]) ? new Promise(function (a, b) { b("Improper Configuration..!!") }) : new Promise(function (b, d) {
                        c.then(function (c) {
                            e(a); b(c.appSDK._sendEvent("API_OPERATION", {
                                scopeName: a.workspace_name, appLinkName: a.app_name, viewLinkName: a.report_name, privatelink: a.private_link, criteria: a.criteria, maxRecords: a.max_records, recordCursor: a.record_cursor, fieldConfig: a.field_config, fields: a.fields,
                                version: a.version, operation: "GET_RECORDS_PUBLISH"
                            }, !0))
                        })
                    })
                }, m.uploadFile = function (a) {
                    if (d(a, ["file", "parent_id"]) || !a.file) return new Promise(function (a, b) { b("Improper Configuration..!!") }); var g = new Promise(function (c, d) {
                        var e = b(a.file), g = "", h = a.file.name; e.then(function (b) {
                            g = b; b = {
                                scopeName: a.workspace_name, appLinkName: a.app_name, viewLinkName: a.report_name, privatelink: a.private_link, id: a.id, fieldName: a.field_name, file: g, fileName: h, version: a.version, operation: a.parent_id ? "UPLD_SBFRM_FLE_PUBLISH" :
                                    "UPLOAD_FILE_PUBLISH"
                            }; a.parent_id && (b.parentId = a.parent_id); f.appSDK._sendEvent("UPLOAD_FILE", b, !0).then(function (a) { c(a) }).catch(function (a) { d(a) })
                        }).catch(function (a) { d(a) })
                    }); return new Promise(function (b, d) { c.then(function (c) { e(a); b(g) }) })
                }, m.updateRecords = function (a) {
                    return d(a) ? new Promise(function (a, b) { b("Improper Configuration..!!") }) : new Promise(function (b, d) {
                        c.then(function (c) {
                            e(a); b(c.appSDK._sendEvent("API_OPERATION", {
                                scopeName: a.workspace_name, appLinkName: a.app_name, viewLinkName: a.report_name,
                                processUntilLimit: a.process_until_limit, privatelink: a.private_link, body: a.payload, version: a.version, operation: "EDIT_RECORDS_PUBLISH"
                            }, !0))
                        })
                    })
                }
    }return m
}
function Util(f, c) {
    return {
        setImageData: function (f, l, e) {
            var d = {}; 
            d.src = l; 
            if (typeof l === "string" && (l.startsWith("/api/v2/") || l.startsWith("/api/v2.1/"))) {
                c.then(
                    function (b) {
                        b.appSDK._sendEvent("IMAGE_LOAD", d, !0).then(
                            function (b) {
                                f.setAttribute("src", b); 
                                e({ status: "200", statusText: "success", originalFile:l});
                            }
                        ).catch(
                            function (b) {
                                if (e) e(b);
                                else {
                                    var a = window.console;
                                    a.log("Error: Unable to set image data");
                                    a.log(b);
                                }
                            }
                        ) 
                    }
                ) 
            } else {
                
                fileToBase64(l).then(function (l2){
                    f.src = l2
                    e({ status: "200", statusText: "success" });
                })
                function fileToBase64(file) {
                    return new Promise((resolve, reject) => {
                        const reader = new FileReader();

                        reader.readAsDataURL(file);

                        reader.onload = () => resolve(reader.result);

                        reader.onerror = error => reject(error);
                    });
                }
            }
        }, getInitParams: function () { return new Promise(function (g, l){c.then(function (){g(f.initParams)})})},
        getQueryParams: function () { return new Promise(function (g, l) { c.then(function () { g(f.queryParams) }) }) }, getWidgetParams: function () { return new Promise(function (g, l) { c.then(function () { g(f.widgetParams) }) }) }, navigateParentURL: function (c) { return c && c.action ? f.appSDK._sendEvent("PARENT_NAVIGATION", c, !0) : new Promise(function (c, e) { e("Improper Configuration..!!") }) }
    }
};