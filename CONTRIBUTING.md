# Contributing to Antigravity Workflow Kit

Thank you for your interest in contributing!

## Development Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/muhib-karim/antigravity-workflow-kit.git
   cd antigravity-workflow-kit
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Compile:
   ```bash
   npm run compile
   ```

4. Package for testing:
   ```bash
   npm run package
   ```

5. Install the VSIX in your editor to test.

## Code Style

- TypeScript with strict mode
- ESLint for linting
- Keep functions small and focused

## Pull Request Process

1. Fork and create a feature branch
2. Make your changes
3. Run `npm run typecheck` and `npm run lint`
4. Submit a PR with a clear description

## Release Process

Releases are automated via GitHub Actions:

1. Update version in `package.json`
2. Create and push a git tag: `git tag v2.12.0 && git push origin v2.12.0`
3. GitHub Actions will automatically:
   - Build and test
   - Publish to VS Code Marketplace
   - Publish to Open VSX
   - Create a GitHub Release with the VSIX

## Questions?

Open an issue or start a discussion on GitHub.
