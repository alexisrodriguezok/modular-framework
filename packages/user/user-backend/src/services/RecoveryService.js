import {DefaultLogger as winston} from '@dracul/logger-backend';
import User from "../models/UserModel";
import {createUserAudit} from "./UserAuditService";
import jwt from "jsonwebtoken";
import UserEmailManager from "./UserEmailManager";
import {hashPassword} from "./UserService";
import validatePasswordLength from "./utils/validatePasswordLength";
import {tokenSignPayload} from "./AuthService";
import {createSession} from "./SessionService";
import jsonwebtoken from "jsonwebtoken";


/*
    @input email: String
    @output {status:Boolean!,message:String}
 */
export const recoveryPassword = function (email) {

    return new Promise((resolve, rejects) => {
        User.findOne({email: email}).populate('role').then((user) => {
            if (user) {
                let token = jwt.sign(
                    {
                        id: user.id,
                        operation: 'recovery'
                    },
                    process.env.JWT_SECRET,
                    {expiresIn: '1d'}
                )
                let url = process.env.APP_WEB_URL + "/recovery/" + token

                UserEmailManager.recovery(email, url, user).then(result => {

                    winston.info('RecoveryService.recoveryPassword successful for '+ user.username)
                    createUserAudit(user.id, user.id, 'passwordRecovery')
                    resolve({status: result, message: 'common.operation.success'})
                }).catch(err => {
                    winston.error("RecoveryService.recoveryPassword ", err)
                    rejects(new Error('common.operation.fail'))
                })


            } else resolve({status: false, message: "user.notFound"})
        }).catch(err => {
            winston.error("RecoveryService.recoveryPassword ", err)
            rejects(new Error('common.operation.fail'))
        })
    })
}

/*
    @input (token: String, newPassword:String, actionBy: Object, req: Object )
    @output {status:Boolean!, message:String}
 */
export const recoveryChangePassword = function (token, newPassword, req) {

    return new Promise((resolve, rejects) => {

        let userDecoded = jwt.verify(token, process.env.JWT_SECRET)

        //Todo specific message
        if (!userDecoded) {
            resolve({status: false, message: "common.operation.fail"})
        }

        //Todo specific message
        if (!validatePasswordLength(newPassword)) {
            resolve({status: false, message: "common.operation.fail"})
        }

        User.findOneAndUpdate(
            {_id: userDecoded.id},
            {password: hashPassword(newPassword)},
            {new: true},
            (error, user) => {

                if (error) {
                    winston.error("RecoveryService.recoveryChangePassword.findOneAndUpdate ", error)
                    resolve({status: false, message: "common.operation.fail"})
                }

                createUserAudit(userDecoded.id, userDecoded.id, 'userRecoveryPasswordChange')

                createSession(user, req).then(session => {

                    const payload = tokenSignPayload(user, session)

                    const options = {
                        expiresIn: process.env.JWT_LOGIN_EXPIRED_IN || '1d',
                        jwtid: user.id
                    }

                    let token = jsonwebtoken.sign(
                        payload,
                        process.env.JWT_SECRET,
                        options
                    )

                    winston.info('RecoveryService.recoveryChangePassword successful for '+ user.username)
                    resolve({status: true, token: token, message: "common.operation.success"})

                }).catch(err => {
                    winston.error("RecoveryService.recoveryChangePassword ", err)
                    reject(err)
                })


            }
        )

    })
}

