# Dependency Upgrade Requirements

This document tracks outdated dependencies that should be upgraded as part of the refactoring effort.

## Current Status

- ✅ Node.js: Updated to v23.8.0 (latest)
- ✅ npm: Using v10.9.2 (comes with Node.js v23.8.0)
- ✅ Monaco Editor: Updated to v0.52.2 (latest)
- ⚠️ Electron: v34.5.0 (latest is v36.4.0)

## Major Dependencies Needing Updates

### High Priority (Security & Compatibility)

1. **Electron**: v34.5.0 → v36.4.0
   - Major version jump may require code changes
   - Check for breaking changes in window management APIs
   - Review security fixes between versions

2. **Monaco Editor**: ✅ COMPLETED - Updated from v0.31.1 → v0.52.2
   - Significant improvements in performance and features
   - Initial testing shows no breaking changes

3. **node-ipc**: v10.1.0 (scheduled for removal)
   - Will be completely removed as part of floating mode removal
   - No upgrade needed

### Medium Priority (Deprecation Warnings)

1. **ESLint**: v8.46.0 → v9.x
   - Configuration format has changed
   - Many plugins need updates

2. **jQuery**: v3.7.0 → Consider removing
   - Modern JavaScript can replace most jQuery usage
   - Would reduce bundle size significantly

### Low Priority (Nice to Have)

1. **Grunt**: Consider migrating to modern build tools
   - Vite or esbuild for faster builds
   - Better development experience

2. **Spectron**: v19.0.0 (deprecated)
   - Migrate to Playwright or WebdriverIO for Electron testing

## Deprecated Packages Found

From npm install warnings:
- readdir-scoped-modules
- source-map-url
- lodash.get
- urix
- resolve-url
- glob@7.2.3 (should be v9+)
- source-map-resolve

## Security Vulnerabilities

npm audit reported:
- 18 vulnerabilities (1 low, 7 moderate, 10 high)
- Run `npm audit` for detailed report

## Recommended Upgrade Path

1. **Phase 1**: Complete floating mode removal first (current work)
2. **Phase 2**: Upgrade Electron to latest
3. **Phase 3**: Update Monaco Editor
4. **Phase 4**: Modernize build system and remove jQuery
5. **Phase 5**: Update testing framework

## Notes

- All dependency updates should be done incrementally
- Each major update should have comprehensive testing
- Consider creating a dependency update branch for each phase