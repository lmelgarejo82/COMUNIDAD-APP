function multerFileSizeLimit(productMaximumBytes) {
  // Busboy emits LIMIT_FILE_SIZE when the stream reaches (not exceeds) this
  // transport threshold. One extra byte keeps the product maximum inclusive;
  // a productMaximumBytes + 1 file still reaches the threshold and is rejected.
  return productMaximumBytes + 1;
}

module.exports = { multerFileSizeLimit };
