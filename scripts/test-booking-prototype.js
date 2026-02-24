"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var fs = require("fs");
var path = require("path");
var OdysseusEngine_1 = require("../lib/services/odysseus/OdysseusEngine");
function testBookingPrototype() {
    return __awaiter(this, void 0, void 0, function () {
        var engine, searchCriteria, results, success, error_1;
        var _a, _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    console.log('--- Starting Odysseus Engine Prototype Test ---');
                    engine = new OdysseusEngine_1.OdysseusEngine();
                    _d.label = 1;
                case 1:
                    _d.trys.push([1, 13, 14, 16]);
                    // 1. Initialize the engine (browser, context, network listeners)
                    // Running headless: false so we can watch it work!
                    return [4 /*yield*/, engine.init(false)];
                case 2:
                    // 1. Initialize the engine (browser, context, network listeners)
                    // Running headless: false so we can watch it work!
                    _d.sent();
                    // 2. Perform Login Flow
                    return [4 /*yield*/, engine.login()];
                case 3:
                    // 2. Perform Login Flow
                    _d.sent();
                    // 3. Preliminary Network check: Validate Odysseus DOM
                    return [4 /*yield*/, engine.validateHealth()];
                case 4:
                    // 3. Preliminary Network check: Validate Odysseus DOM
                    _d.sent();
                    searchCriteria = {
                        vendorId: 8, // Royal Caribbean
                        passengers: 2,
                        guestAges: [35, 35],
                        guestStateResidence: 'FL'
                    };
                    return [4 /*yield*/, engine.searchCruises(searchCriteria)];
                case 5:
                    results = _d.sent();
                    console.log("\nReturned ".concat(results.length, " cruise results."));
                    if (!(results.length > 0)) return [3 /*break*/, 12];
                    console.log('\n--- First Result Sample ---');
                    console.log('Cruise Name:', results[0].name);
                    console.log('Ship Name:', ((_b = (_a = results[0].ship) === null || _a === void 0 ? void 0 : _a.cruiseline) === null || _b === void 0 ? void 0 : _b.id) === 8 ? 'Royal Caribbean' : 'Unknown');
                    console.log('Total Packages:', ((_c = results[0].packages) === null || _c === void 0 ? void 0 : _c.length) || 0);
                    if (results[0].prices && results[0].prices.length > 0) {
                        console.log('Base Prices Array:', results[0].prices[0].items.map(function (p) { return "".concat(p.name || p.code, ": $").concat(p.value); }).join(', '));
                    }
                    console.log('---------------------------\n');
                    // 5. Test Itinerary Selection Navigation
                    console.log("[Test] Attempting to click \"Book\" on Voyage Code: ".concat(results[0].code));
                    return [4 /*yield*/, engine.selectItinerary(0)];
                case 6:
                    _d.sent();
                    // Wait longer to ensure category API calls have time to fire
                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 20000); })];
                case 7:
                    // Wait longer to ensure category API calls have time to fire
                    _d.sent();
                    // Take a screenshot of the category page
                    console.log("[Test] Taking screenshot of the post-Book state...");
                    if (!engine.odysseusPage) return [3 /*break*/, 9];
                    return [4 /*yield*/, engine.odysseusPage.screenshot({ path: 'category-page-state.png', fullPage: true })];
                case 8:
                    _d.sent();
                    console.log("[Test] Post-Book URL: ".concat(engine.odysseusPage.url()));
                    _d.label = 9;
                case 9: return [4 /*yield*/, engine.bypassGuestInfoAndContinue([35, 35], 'FL')];
                case 10:
                    success = _d.sent();
                    console.log("[Test] Bypass successful? ".concat(success, ". Should be on Category page now."));
                    if (!success) return [3 /*break*/, 12];
                    // 7. Test the holdCabin scaffolding (clicks Book Now for the first category)
                    console.log("[Test] Proceeding to test holdCabin scaffolding...");
                    return [4 /*yield*/, engine.holdCabin({})];
                case 11:
                    _d.sent();
                    console.log("[Test] holdCabin scaffolding complete.");
                    _d.label = 12;
                case 12:
                    // 7. Dump the intercepted payload for analysis
                    if (engine.interceptedData.length > 0) {
                        console.log("\n[Test] Captured ".concat(engine.interceptedData.length, " relevant network responses. Dumping to file..."));
                        fs.writeFileSync(path.join(process.cwd(), 'odysseus-intercepted-payloads.json'), JSON.stringify(engine.interceptedData, null, 2));
                        console.log('[Test] Saved to odysseus-intercepted-payloads.json');
                    }
                    else {
                        console.log('\n[Test] No matching XHR data was intercepted.');
                    }
                    return [3 /*break*/, 16];
                case 13:
                    error_1 = _d.sent();
                    console.error('Prototype test failed:', error_1);
                    return [3 /*break*/, 16];
                case 14: return [4 /*yield*/, engine.close()];
                case 15:
                    _d.sent();
                    console.log('--- Prototype Test Complete ---');
                    return [7 /*endfinally*/];
                case 16: return [2 /*return*/];
            }
        });
    });
}
testBookingPrototype();
