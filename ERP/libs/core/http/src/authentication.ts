import * as express from 'express';
import * as jwt from 'jsonwebtoken';
import { securityConfig } from '@core/config';

/**
 * Hàm expressAuthentication được tsoa tự động gọi đối với các endpoint có @Security()
 * @param request Express Request
 * @param securityName Tên phương thức bảo mật (vd: "jwt")
 * @param scopes Danh sách quyền yẫu cầu (vd: ["admin"])
 */
export async function expressAuthentication(
    request: express.Request,
    securityName: string,
    scopes?: string[]
): Promise<any> {
    if (securityName === 'jwt') {
        const authHeader = request.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return Promise.reject(new Error('No token provided'));
        }

        const token = authHeader.split(' ')[1];

        return new Promise((resolve, reject) => {
            jwt.verify(token, securityConfig.jwtSecret, (err: any, decoded: any) => {
                if (err) {
                    return reject(new Error('Invalid token'));
                }

                // Check scopes (roles) if provided in @Security("jwt", ["admin"])
                if (scopes && scopes.length > 0) {
                    const userRoles: string[] = Array.isArray(decoded?.roles)
                        ? decoded.roles
                        : (decoded?.role ? [decoded.role] : []);
                    const hasRequiredScope = scopes.some(scope => userRoles.includes(scope));

                    if (!hasRequiredScope) {
                        return reject(new Error('Insufficient scope/role'));
                    }
                }

                // decoded in JWT sẽ được nạp thẳng vào request.user qua tsoa
                resolve(decoded);
            });
        });
    }

    return Promise.reject(new Error('Unknown security name'));
}
