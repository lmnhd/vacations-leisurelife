# Google Ads API Design Documentation

## 1. Tool Overview
**Tool Name:** Leisure Life Interactive Campaign Dispatcher
**Company:** Leisure Life Interactive (HALIMEDE LLC)
**Primary Use Case:** Internal automation tool to create paused draft Google Display campaigns for niche group cruise vacations.
**Intended Users:** Internal employees only.

## 2. Business Model and Justification
Leisure Life Interactive builds interactive group cruise campaigns. We use the Google Ads API to automate the manual, time-consuming process of staging display campaigns. Our internal platform generates tailored ad copy and aesthetic assets for specific cruise packages. The API integration takes these approved assets and automatically stages a "Paused" campaign in our Google Ads account for final human review before launch.

## 3. Architecture & API Interaction Flow
Our application is a Next.js (TypeScript) web application that interacts with the Google Ads API using the official `google-ads-api` Node.js library. 

The workflow is strictly unidirectional (creation of drafts):
1. **Authentication:** Internal users authenticate via standard OAuth 2.0 Web Application flow to grant access to our Manager/Standard account.
2. **Asset Upload:** The tool uses `AssetService` to upload internally generated hero images and logos for the display ad.
3. **Budget Creation:** The tool uses `CampaignBudgetService` to create a standard daily budget.
4. **Campaign Staging:** The tool uses `CampaignService` to create a new Display Campaign with the status explicitly set to `PAUSED`.
5. **Ad Group Staging:** The tool uses `AdGroupService` to create an ad group under the new campaign (Status: `PAUSED`).
6. **Ad Creation:** The tool uses `AdGroupAdService` to construct a Responsive Display Ad, binding the previously uploaded assets and inserting generated headlines and descriptions.

## 4. Specific Google Ads API Services Utilized
* `CustomerService` (for account validation)
* `AssetService` (MutateAssets)
* `CampaignBudgetService` (MutateCampaignBudgets)
* `CampaignService` (MutateCampaigns)
* `AdGroupService` (MutateAdGroups)
* `AdGroupAdService` (MutateAdGroupAds)

## 5. Data Management and Security
* We do not expose this tool to external clients. 
* Tokens are stored securely in an internal DynamoDB table.
* The application does not read or pull historical performance data, it only pushes new draft campaign configurations.
* All campaigns are created in a `PAUSED` state to ensure human oversight before any ad spend occurs.
