import express from 'express';
import startPriceFeed from './src/price_feed.js';

const app = express()
const port = 3000

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
  startPriceFeed(app);
})