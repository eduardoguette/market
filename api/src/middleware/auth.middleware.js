function requireToken(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token || token !== process.env.MARKET_API_TOKEN) {
    return res.status(401).json({ error: "invalid token" });
  }
  next();
}

module.exports = { requireToken };
