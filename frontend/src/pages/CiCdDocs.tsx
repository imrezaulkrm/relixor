import React, { useState } from 'react';
import {
  Copy,
  Check,
  FileCode2,
  Terminal,
  Server,
  Layers,
  ShieldCheck,
  Globe,
} from 'lucide-react';

export const CiCdDocs: React.FC = () => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'gitlab' | 'github' | 'jenkins' | 'curl' | 'api'>('gitlab');

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const gitlabCiSnippet = `# .gitlab-ci.yml
# Relixor APK Store Release Publishing Job

stages:
  - build
  - publish

# Example Android APK build step
build_apk:
  stage: build
  image: eclipse-temurin:17-jdk-jammy
  script:
    - echo "Building Android APK..."
    - ./gradlew assembleRelease
  artifacts:
    paths:
      - app/build/outputs/apk/release/app-release.apk
    expire_in: 1 day

# Publish built APK to private Relixor Store
publish_relixor_release:
  stage: publish
  image: curlimages/curl:latest
  dependencies:
    - build_apk
  variables:
    # Set these as Masked and Protected Variables in GitLab:
    # Project Settings -> CI/CD -> Variables
    # - APK_STORE_URL (e.g., https://apk.internal.yourcompany.com)
    # - APK_STORE_TOKEN (relixor_live_...)
    # - APK_STORE_APP_ID (UUID of the registered App in Relixor)
    # - APP_VERSION (e.g., "1.4.0" or dynamic $CI_COMMIT_TAG)
    # - APP_VERSION_CODE (e.g., "140" or $CI_PIPELINE_IID)
    RELEASE_CHANNEL: "STAGING" # DEV, QA, STAGING, or PRODUCTION
  script:
    - |
      echo "Publishing APK to Relixor Private Store: \${APK_STORE_URL}"
      curl --fail-with-body --show-error --location \\
        --request POST \\
        --header "Authorization: Bearer \${APK_STORE_TOKEN}" \\
        --form "file=@app/build/outputs/apk/release/app-release.apk" \\
        --form "version=\${APP_VERSION:-\$CI_COMMIT_TAG}" \\
        --form "versionCode=\${APP_VERSION_CODE:-\$CI_PIPELINE_IID}" \\
        --form "channel=\${RELEASE_CHANNEL}" \\
        --form "notes=Automated release from GitLab pipeline #\${CI_PIPELINE_ID} (commit \${CI_COMMIT_SHORT_SHA} by \${GITLAB_USER_NAME})" \\
        "\${APK_STORE_URL}/api/v1/apps/\${APK_STORE_APP_ID}/releases"
  rules:
    - if: '$CI_COMMIT_BRANCH == "main"'
    - if: '$CI_COMMIT_TAG'
`;

  const githubActionsSnippet = `# .github/workflows/publish-release.yml
name: Build & Publish APK to Relixor Store

on:
  push:
    tags:
      - 'v*'
  workflow_dispatch:

jobs:
  build-and-publish:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Source Code
        uses: actions/checkout@v4

      - name: Set up Java JDK 17
        uses: actions/setup-java@v4
        with:
          distribution: 'temurin'
          java-version: '17'

      - name: Build Android Release APK
        run: ./gradlew assembleRelease

      - name: Publish APK to Relixor
        env:
          APK_STORE_URL: \${{ secrets.APK_STORE_URL }}
          APK_STORE_TOKEN: \${{ secrets.APK_STORE_TOKEN }}
          APK_STORE_APP_ID: \${{ secrets.APK_STORE_APP_ID }}
        run: |
          VERSION="\${GITHUB_REF_NAME#v}"
          VERSION_CODE="\${GITHUB_RUN_NUMBER}"

          curl --fail-with-body --show-error --location \\
            --request POST \\
            --header "Authorization: Bearer \${APK_STORE_TOKEN}" \\
            --form "file=@app/build/outputs/apk/release/app-release.apk" \\
            --form "version=\${VERSION}" \\
            --form "versionCode=\${VERSION_CODE}" \\
            --form "channel=PRODUCTION" \\
            --form "notes=Automated release via GitHub Actions run #\${GITHUB_RUN_ID} (commit \${GITHUB_SHA::7})" \\
            "\${APK_STORE_URL}/api/v1/apps/\${APK_STORE_APP_ID}/releases"
`;

  const jenkinsSnippet = `// Jenkinsfile
pipeline {
    agent any

    environment {
        // Stored under Jenkins Credentials
        APK_STORE_URL    = "https://apk.internal.yourcompany.com"
        APK_STORE_APP_ID = "YOUR_RELIXOR_APP_ID"
        APK_STORE_CREDS  = credentials('relixor-api-token') // Secret text
        APP_VERSION      = "1.3.0"
    }

    stages {
        stage('Build APK') {
            steps {
                sh './gradlew assembleRelease'
            }
        }

        stage('Publish to Relixor Store') {
            steps {
                sh '''
                    curl --fail-with-body --show-error --location \\
                      --request POST \\
                      --header "Authorization: Bearer \${APK_STORE_CREDS}" \\
                      --form "file=@app/build/outputs/apk/release/app-release.apk" \\
                      --form "version=\${APP_VERSION}" \\
                      --form "versionCode=\${BUILD_NUMBER}" \\
                      --form "channel=STAGING" \\
                      --form "notes=Automated release from Jenkins build #\${BUILD_NUMBER}" \\
                      "\${APK_STORE_URL}/api/v1/apps/\${APK_STORE_APP_ID}/releases"
                '''
            }
        }
    }
}
`;

  const curlSnippet = `# Direct Shell / cURL Publishing Example
APK_STORE_URL="http://localhost:5000"
APK_STORE_TOKEN="relixor_live_your_secret_token_here"
APK_STORE_APP_ID="YOUR_APP_UUID_HERE"

curl --fail-with-body --show-error --location \\
  --request POST \\
  --header "Authorization: Bearer \${APK_STORE_TOKEN}" \\
  --form "file=@/path/to/app-release.apk" \\
  --form "version=1.0.0" \\
  --form "versionCode=100" \\
  --form "channel=PRODUCTION" \\
  --form "notes=Initial stable production rollout" \\
  "\${APK_STORE_URL}/api/v1/apps/\${APK_STORE_APP_ID}/releases"
`;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">CI/CD & REST API Integration</h1>
        <p className="text-sm text-slate-400 mt-1">
          Complete guides and code snippets for automated pipeline publishing to Relixor.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-4 overflow-x-auto">
        <button
          onClick={() => setActiveTab('gitlab')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 ${
            activeTab === 'gitlab'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <FileCode2 className="w-4 h-4" />
          GitLab CI/CD
        </button>

        <button
          onClick={() => setActiveTab('github')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 ${
            activeTab === 'github'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Globe className="w-4 h-4" />
          GitHub Actions
        </button>

        <button
          onClick={() => setActiveTab('jenkins')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 ${
            activeTab === 'jenkins'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Server className="w-4 h-4" />
          Jenkins Pipeline
        </button>

        <button
          onClick={() => setActiveTab('curl')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 ${
            activeTab === 'curl'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Terminal className="w-4 h-4" />
          cURL / CLI
        </button>

        <button
          onClick={() => setActiveTab('api')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 ${
            activeTab === 'api'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Layers className="w-4 h-4" />
          REST Endpoints
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'gitlab' && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-white">GitLab CI/CD Publishing Pipeline</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Save this snippet in your Android repository as <code className="text-indigo-400">.gitlab-ci.yml</code>.
                </p>
              </div>
              <button
                onClick={() => handleCopy(gitlabCiSnippet, 'gitlab')}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
              >
                {copiedKey === 'gitlab' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy YAML</span>
                  </>
                )}
              </button>
            </div>
            <pre className="bg-slate-950 p-4 rounded-xl text-xs font-mono text-slate-300 overflow-x-auto leading-relaxed border border-slate-800">
              {gitlabCiSnippet}
            </pre>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              GitLab CI/CD Variables Setup Checklist
            </h4>
            <div className="space-y-2 text-xs text-slate-300">
              <p>Navigate to <strong>Settings &gt; CI/CD &gt; Variables</strong> in GitLab and configure:</p>
              <ul className="list-disc list-inside space-y-1.5 text-slate-400 pl-2">
                <li><code className="text-indigo-400 font-mono">APK_STORE_URL</code>: Base URL of your Relixor deployment (e.g. <code className="text-slate-300">https://apk.company.internal</code>).</li>
                <li><code className="text-indigo-400 font-mono">APK_STORE_TOKEN</code>: Generated Relixor API Token (mark as <strong>Masked</strong> &amp; <strong>Protected</strong>).</li>
                <li><code className="text-indigo-400 font-mono">APK_STORE_APP_ID</code>: Target application UUID from the Relixor Apps dashboard.</li>
                <li><code className="text-indigo-400 font-mono">APP_VERSION</code>: Release version string (e.g. <code className="text-slate-300">1.0.0</code>).</li>
                <li><code className="text-indigo-400 font-mono">APP_VERSION_CODE</code>: Positive integer build counter (e.g. <code className="text-slate-300">100</code>).</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'github' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-white">GitHub Actions Workflow</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Save as <code className="text-indigo-400">.github/workflows/publish-release.yml</code>.
              </p>
            </div>
            <button
              onClick={() => handleCopy(githubActionsSnippet, 'github')}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
            >
              {copiedKey === 'github' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedKey === 'github' ? 'Copied!' : 'Copy YAML'}</span>
            </button>
          </div>
          <pre className="bg-slate-950 p-4 rounded-xl text-xs font-mono text-slate-300 overflow-x-auto leading-relaxed border border-slate-800">
            {githubActionsSnippet}
          </pre>
        </div>
      )}

      {activeTab === 'jenkins' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-white">Jenkins Pipeline (Jenkinsfile)</h3>
              <p className="text-xs text-slate-400 mt-0.5">Declarative Jenkins pipeline stage using curl.</p>
            </div>
            <button
              onClick={() => handleCopy(jenkinsSnippet, 'jenkins')}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
            >
              {copiedKey === 'jenkins' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedKey === 'jenkins' ? 'Copied!' : 'Copy Script'}</span>
            </button>
          </div>
          <pre className="bg-slate-950 p-4 rounded-xl text-xs font-mono text-slate-300 overflow-x-auto leading-relaxed border border-slate-800">
            {jenkinsSnippet}
          </pre>
        </div>
      )}

      {activeTab === 'curl' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-white">Direct cURL Command</h3>
              <p className="text-xs text-slate-400 mt-0.5">Upload releases from terminal or deployment scripts.</p>
            </div>
            <button
              onClick={() => handleCopy(curlSnippet, 'curl')}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
            >
              {copiedKey === 'curl' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedKey === 'curl' ? 'Copied!' : 'Copy cURL'}</span>
            </button>
          </div>
          <pre className="bg-slate-950 p-4 rounded-xl text-xs font-mono text-slate-300 overflow-x-auto leading-relaxed border border-slate-800">
            {curlSnippet}
          </pre>
        </div>
      )}

      {activeTab === 'api' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
          <h3 className="text-base font-bold text-white">REST API Specification</h3>

          <div className="divide-y divide-slate-800">
            {/* Upload Release */}
            <div className="py-4 space-y-2">
              <div className="flex items-center gap-3">
                <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded font-mono font-bold text-xs">POST</span>
                <code className="text-xs font-mono text-slate-200">/api/v1/apps/:appId/releases</code>
              </div>
              <p className="text-xs text-slate-400">
                Upload and publish a new APK release. Accepts <code className="text-slate-300">multipart/form-data</code> with fields: <code className="text-slate-300">file</code>, <code className="text-slate-300">version</code>, <code className="text-slate-300">versionCode</code>, <code className="text-slate-300">channel</code>, and <code className="text-slate-300">notes</code>.
              </p>
            </div>

            {/* List Apps */}
            <div className="py-4 space-y-2">
              <div className="flex items-center gap-3">
                <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded font-mono font-bold text-xs">GET</span>
                <code className="text-xs font-mono text-slate-200">/api/v1/apps</code>
              </div>
              <p className="text-xs text-slate-400">
                List all authorized applications, metadata, release counts, and latest versions. Supports query search <code className="text-slate-300">?search=...</code>.
              </p>
            </div>

            {/* List Releases */}
            <div className="py-4 space-y-2">
              <div className="flex items-center gap-3">
                <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded font-mono font-bold text-xs">GET</span>
                <code className="text-xs font-mono text-slate-200">/api/v1/apps/:appId/releases</code>
              </div>
              <p className="text-xs text-slate-400">
                List releases for an application. Filter by channel with <code className="text-slate-300">?channel=DEV|QA|STAGING|PRODUCTION</code>.
              </p>
            </div>

            {/* Download Release */}
            <div className="py-4 space-y-2">
              <div className="flex items-center gap-3">
                <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded font-mono font-bold text-xs">GET</span>
                <code className="text-xs font-mono text-slate-200">/api/v1/apps/:appId/releases/:releaseId/download</code>
              </div>
              <p className="text-xs text-slate-400">
                Authorized download stream of the APK binary. Includes <code className="text-slate-300">Content-Disposition</code>, <code className="text-slate-300">Content-Length</code>, and <code className="text-slate-300">X-Checksum-SHA256</code> headers.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
