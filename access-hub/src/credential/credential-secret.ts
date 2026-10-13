import { createHash, randomBytes } from "crypto"

type NewCredentialSecret = {
    publicId: string,
    secret: string,
    secretHash: string
}

export function newCredentialSecret(): NewCredentialSecret {
    const secret = randomBytes(32).toString('base64url');

    return {
        publicId: randomBytes(16).toString('base64url'),
        secret,
        secretHash: hashSecret(secret)
    }

}

export function hashSecret(secret: string): string {
    return createHash('sha256').update(secret).digest('hex');
}