"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileMatcher = void 0;
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
class FileMatcher {
    constructor(retailBase, restaurantBase) {
        this.retailBase = retailBase;
        this.restaurantBase = restaurantBase;
    }
    match(retailFiles, restaurantFiles, manualOverrides) {
        const matched = [];
        const matchedRetail = new Set();
        const matchedRestaurant = new Set();
        // Build lookup maps
        const restaurantByPath = new Map();
        const restaurantByClass = new Map();
        const restaurantBySelector = new Map();
        for (const file of restaurantFiles) {
            // Normalize path relative to restaurant base
            const relPath = this.normalizeRelativePath(file.filePath, this.restaurantBase);
            restaurantByPath.set(relPath, file);
            if (file.className) {
                restaurantByClass.set(file.className, file);
            }
            if (file.selector) {
                restaurantBySelector.set(file.selector, file);
            }
        }
        // Apply manual overrides first
        if (manualOverrides) {
            for (const [retailPath, restaurantPath] of Object.entries(manualOverrides)) {
                const retailFile = retailFiles.find(f => this.normalizeRelativePath(f.filePath, this.retailBase) === retailPath);
                const restaurantFile = restaurantFiles.find(f => this.normalizeRelativePath(f.filePath, this.restaurantBase) === restaurantPath);
                if (retailFile) {
                    matched.push({
                        retailFile: retailFile.filePath,
                        restaurantFile: restaurantFile?.filePath || null,
                        matchMethod: 'manual',
                    });
                    matchedRetail.add(retailFile.filePath);
                    if (restaurantFile) {
                        matchedRestaurant.add(restaurantFile.filePath);
                    }
                }
            }
        }
        // Match by relative path
        for (const retailFile of retailFiles) {
            if (matchedRetail.has(retailFile.filePath))
                continue;
            const relPath = this.normalizeRelativePath(retailFile.filePath, this.retailBase);
            const restaurantFile = restaurantByPath.get(relPath);
            if (restaurantFile && !matchedRestaurant.has(restaurantFile.filePath)) {
                matched.push({
                    retailFile: retailFile.filePath,
                    restaurantFile: restaurantFile.filePath,
                    matchMethod: 'path',
                });
                matchedRetail.add(retailFile.filePath);
                matchedRestaurant.add(restaurantFile.filePath);
            }
        }
        // Match by class name (for files that moved)
        for (const retailFile of retailFiles) {
            if (matchedRetail.has(retailFile.filePath))
                continue;
            if (!retailFile.className)
                continue;
            const restaurantFile = restaurantByClass.get(retailFile.className);
            if (restaurantFile && !matchedRestaurant.has(restaurantFile.filePath)) {
                matched.push({
                    retailFile: retailFile.filePath,
                    restaurantFile: restaurantFile.filePath,
                    matchMethod: 'classname',
                });
                matchedRetail.add(retailFile.filePath);
                matchedRestaurant.add(restaurantFile.filePath);
            }
        }
        // Match by selector (for renamed components)
        for (const retailFile of retailFiles) {
            if (matchedRetail.has(retailFile.filePath))
                continue;
            if (!retailFile.selector)
                continue;
            const restaurantFile = restaurantBySelector.get(retailFile.selector);
            if (restaurantFile && !matchedRestaurant.has(restaurantFile.filePath)) {
                matched.push({
                    retailFile: retailFile.filePath,
                    restaurantFile: restaurantFile.filePath,
                    matchMethod: 'selector',
                });
                matchedRetail.add(retailFile.filePath);
                matchedRestaurant.add(restaurantFile.filePath);
            }
        }
        // Mark unmatched as retail-only
        for (const retailFile of retailFiles) {
            if (!matchedRetail.has(retailFile.filePath)) {
                matched.push({
                    retailFile: retailFile.filePath,
                    restaurantFile: null,
                    matchMethod: 'unmatched',
                });
            }
        }
        // Collect restaurant-only files
        const restaurantOnly = [];
        for (const restaurantFile of restaurantFiles) {
            if (!matchedRestaurant.has(restaurantFile.filePath)) {
                restaurantOnly.push(restaurantFile.filePath);
            }
        }
        const retailOnly = matched
            .filter(m => m.restaurantFile === null)
            .map(m => m.retailFile);
        return {
            matched: matched.filter(m => m.restaurantFile !== null),
            retailOnly,
            restaurantOnly,
        };
    }
    normalizeRelativePath(filePath, basePath) {
        let rel = path.relative(basePath, filePath);
        // Normalize separators
        rel = rel.replace(/\\/g, '/');
        return rel;
    }
    saveMappingFile(result, outputPath) {
        const config = {
            mappings: result.matched,
            retailOnly: result.retailOnly,
            restaurantOnly: result.restaurantOnly,
            manualOverrides: {},
        };
        fs.writeFileSync(outputPath, JSON.stringify(config, null, 2));
    }
    loadMappingFile(inputPath) {
        if (!fs.existsSync(inputPath))
            return null;
        try {
            const content = fs.readFileSync(inputPath, 'utf-8');
            return JSON.parse(content);
        }
        catch {
            return null;
        }
    }
}
exports.FileMatcher = FileMatcher;
