module.exports = {
  apps: [
    {
      name: "nm-ai",
      script: "dist/index.cjs",
      cwd: "/srv/gwen-stacy/nm-ai",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
      },
    },
  ],
};
