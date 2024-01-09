"use server"
import RSSParser from 'rss-parser'
import axios from 'axios'
import FeedList from './cruiseLineFeeds.json'

const parser = new RSSParser()

const rcFeed = 'https://www.royalcaribbeanpresscenter.com/feed/'

export async function getFeed(feedURL = rcFeed) {
  const feed = await parser.parseURL(feedURL);
  const { items, title} = feed;
  console.log(`Fetched ${items.length} items from ${title}`);
  return { articles:items, lineTitle:title };
}


async function start() {
  const feedURL = 'https://carnival-news.com/feed/';
  await getFeed(feedURL);
}


