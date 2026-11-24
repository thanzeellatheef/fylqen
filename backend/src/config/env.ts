export const env = {
  jwtSecret: process.env.JWT_SECRET,
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173',
  port: Number(process.env.PORT ?? 4000),
}
import 'dotenv/config'
