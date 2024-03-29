# React POL: page on live

서비스중인 웹페이지에 개발중인 React App을 삽입하여, 배포될 환경과 동일한 환경에서 웹앱을 개발할 수 있도록 하는 Vite Plugin입니다. 

## Example

```javascript
// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import reactPageOnLive from "vite-plugin-react-pol";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    reactPageOnLive({
      livePageOrigin: 'https://www.w3schools.com/html/html_basic.asp',
    }),
  ],
});
```
