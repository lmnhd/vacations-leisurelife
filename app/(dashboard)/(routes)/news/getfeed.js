"use server"
import RSSParser from 'rss-parser'
import axios from 'axios'

const parser = new RSSParser()

const rcFeed = 'https://www.royalcaribbeanpresscenter.com/feed/'

function sanitizeFeedText(text = '') {
  return text.replace(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;)/g, '&amp;')
}

export async function getFeed(feedURL = rcFeed) {
  try {
    const response = await axios.get(feedURL, {
      timeout: 10000,
      headers: {
        'User-Agent': 'LeisureLifeNewsBot/1.0',
        Accept: 'application/xml, text/xml, */*;q=0.8'
      }
    })

    const feedText = sanitizeFeedText(response.data)
    const feed = await parser.parseString(feedText)
    const { items, title } = feed
    console.log(`Fetched ${items.length} items from ${title}`)
    return { articles: items, lineTitle: title }
  } catch (error) {
    if (error instanceof Error) {
      console.error('Failed to parse RSS feed', feedURL, error.message)
    } else {
      console.error('Unknown RSS fetch error', feedURL)
    }
    return { articles: [], lineTitle: '' }
  }
}


async function start() {
  const feedURL = 'https://carnival-news.com/feed/';
  await getFeed(feedURL);
}


