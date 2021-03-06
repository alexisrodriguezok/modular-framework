import {DefaultLogger as winston} from '@dracul/logger-backend';

import User from '../models/UserModel'
import '../models/GroupModel'
import {createUserAudit} from './UserAuditService'
import bcryptjs from 'bcryptjs'
import {UserInputError} from 'apollo-server-express'
import path from 'path'
import fs from 'fs'
import createDirIfNotExist from "./utils/createDirIfNotExist";

export const hashPassword = function (password) {
    if (!password) {
        throw new Error("password must be provided")
    }

    let salt = bcryptjs.genSaltSync(10);
    let hashPassword = bcryptjs.hashSync(password, salt);
    return hashPassword;
}

export const createUser = async function ({username, password, name, email, phone, role, groups, active}, actionBy = null) {


    const newUser = new User({
        username,
        email,
        password: hashPassword(password),
        name,
        phone,
        active,
        role,
        groups,
        createdAt: Date.now()

    })

    return new Promise((resolve, reject) => {
        newUser.save((error, doc) => {
            if (error) {
                if (error.name == "ValidationError") {
                    winston.warn("createUser ValidationError ", error)
                    reject(new UserInputError(error.message, {inputErrors: error.errors}));
                } else {
                    winston.error("UserService.createUser ", error)
                }
                reject(error)
            } else {
                winston.info('UserService.createUser successful for ' + doc.username)
                createUserAudit(actionBy ? actionBy.id : null, doc._id, 'userCreated')
                doc.populate('role').populate('groups').execPopulate(() => (resolve(doc))
                )
            }
        })
    })
}


export const updateUser = async function (id, {username, name, email, phone, role, groups, active}, actionBy = null) {

    return new Promise((resolve, reject) => {
        let updatedAt = Date.now()

        User.findOneAndUpdate(
            {_id: id}, {username, name, email, phone, role, groups, active, updatedAt}, {
                new: true,
                runValidators: true,
                context: 'query'
            },
            (error, doc) => {
                if (error) {

                    if (error.name == "ValidationError") {
                        winston.warn("updateUser ValidationError ", error)
                        reject(new UserInputError(error.message, {inputErrors: error.errors}));
                    } else {
                        winston.error("UserService.updateUser ", error)
                    }

                    reject(error)
                } else {
                    winston.info('UserService.updateUser successful for ' + doc.username)
                    createUserAudit(actionBy ? actionBy.id : null, doc._id, 'userModified')
                    doc.populate('role').populate('groups').execPopulate(() => resolve(doc))
                }
            }
        );
    })
}

export const deleteUser = function (id, actionBy = null) {
    return new Promise((resolve, reject) => {

        findUser(id).then((doc) => {
            doc.softdelete(function (err) {
                createUserAudit(actionBy ? actionBy.id : null, doc._id, 'userDeleted')
                if (err) {
                    winston.error("UserService.deleteUser ", err)
                    reject(err)
                } else {
                    winston.info('UserService.deleteUser successful for ' + doc.username)
                    resolve({success: true, id: id})
                }
            });
        })

    })
}


export const findUsers = function (roles = []) {
    return new Promise((resolve, reject) => {

        let qs = {}

        if (roles && roles.length) {
            qs.role = {$in: roles}
        }

        User.find(qs).isDeleted(false).populate('role').populate('groups').exec((err, res) => {
            if (err) {
                winston.error("UserService.findUsers ", err)
                reject(err)
            } else {
                winston.debug('UserService.findUsers successful')
                resolve(res)
            }
        });
    })
}


export const paginateUsers = function (limit, pageNumber = 1, search = null, orderBy = null, orderDesc = false, roles = []) {

    function getQuery(search) {
        let qs = {}

        if (search) {
            qs = {
                $or: [
                    {name: {$regex: search, $options: 'i'}},
                    {username: {$regex: search, $options: 'i'}},
                    {email: {$regex: search, $options: 'i'}},
                    {phone: {$regex: search, $options: 'i'}}
                ]
            }
        }
        if (roles && roles.length) {
            qs.role = {$in: roles}
        }

        return qs
    }

    function getSort(orderBy, orderDesc) {
        if (orderBy) {
            return (orderDesc ? '-' : '') + orderBy
        } else {
            return null
        }
    }


    let query = {deleted: false, ...getQuery(search)}
    let populate = ['role', 'groups']
    let sort = getSort(orderBy, orderDesc)

    let params = {page: pageNumber, limit: limit, populate: populate, sort}
    return new Promise((resolve, reject) => {
        User.paginate(query, params).then(result => {
                winston.debug('UserService.paginateUsers successful')
                resolve({users: result.docs, totalItems: result.totalDocs, page: result.page})
            }
        ).catch(err => {
            winston.error("UserService.paginateUsers ", err)
            reject(err)
        })
    })
}

export const findUser = function (id) {
    return new Promise((resolve, reject) => {
        User.findOne({_id: id}).populate('role').populate('groups').exec((err, res) => {
            if (err) {
                winston.error("UserService.findUser ", err)
                reject(err)
            } else {
                winston.debug('UserService.findUser successful')
                resolve(res)
            }
        });
    })
}

export const findUserByUsername = function (name) {
    return new Promise((resolve, reject) => {
        User.findOne({username: name}).populate('role').populate('groups').exec((err, res) => {
            if (err) {
                winston.error("UserService.findUserByUsername ", err)
                reject(err)
            } else {
                winston.debug('UserService.findUserByUsername successful')
                resolve(res)
            }
        });
    })
}


export const changePasswordAdmin = function (id, {password, passwordVerify}, actionBy = null) {

    if (password == passwordVerify) {

        return new Promise((resolve, rejects) => {
            User.findOneAndUpdate(
                {_id: id}, {password: hashPassword(password)}, {new: true},
                (err, doc) => {
                    if (err) {
                        winston.error("UserService.changePasswordAdmin ", err)
                        rejects({status: false, message: "Change password fail"})
                    } else {
                        winston.debug('UserService.changePasswordAdmin successful')
                        createUserAudit(actionBy.id, id, (actionBy.id === id) ? 'userPasswordChange' : 'changePasswordAdmin')
                        resolve({success: true, message: "PasswordChange", operation: "changePasswordAdmin"})
                    }
                }
            );
        })


    } else {
        return new Promise((resolve, rejects) => {
            resolve({status: false, message: "Password doesn't match"})
        })
    }
}

export const changePassword = function (id, {currentPassword, newPassword}, actionBy = null) {
    return new Promise(async (resolve, rejects) => {
        let user = await User.findOne({_id: id})
        if (bcryptjs.compareSync(currentPassword, user.password)) {
            User.findOneAndUpdate(
                {_id: id}, {password: hashPassword(newPassword)}, {new: true},
                (err, doc) => {
                    if (err) {
                        winston.error("UserService.changePassword ", err)
                        rejects(error)
                    } else {
                        winston.debug('UserService.changePassword successful')
                        createUserAudit(actionBy.id, id, (actionBy.id === id) ? 'userPasswordChange' : 'adminPasswordChange')
                        resolve({status: true, message: "Password Changed"})
                    }
                }
            );
        } else {
            winston.warn("UserService.changePassword: password doesnt match")
            rejects(new UserInputError('auth.wrongPassword',
                {
                    inputErrors: {
                        currentPassword: {properties: {message: 'auth.wrongPassword'}}
                    }
                }));
        }
    })
}


const storeFS = (stream, dst) => {
    return new Promise((resolve, reject) =>
        stream
            .on('error', err => {
                if (stream.truncated) {
                    fs.unlinkSync(dst)
                }
                winston.error("UserService.storeFS: stream error", err)
                reject(err)
            })
            .pipe(fs.createWriteStream(dst))
            .on('error', err => {
                winston.error("UserService.storeFS: createWriteStream error: ", err)
                reject(err)
            })
            .on('finish', () => {
                winston.debug('UserService.storeFS finish successful')
                resolve(true)
            })
    );
}


export const avatarUpload = function (user, file) {


    return new Promise(async (resolve, reject) => {
        //@TODO validate image size, extension
        const {filename, mimetype, encoding, createReadStream} = await file;

        const parseFileName = path.parse(filename);
        const finalFileName = user.username + parseFileName.ext
        const dst = path.join("media", "avatar", finalFileName)

        //Store
        createDirIfNotExist(dst)
        let fileResult = await storeFS(createReadStream(), dst)

        if (fileResult) {
            const rand = randomstring(3)
            const url = process.env.APP_API_URL + "/media/avatar/" + finalFileName + "?" + rand

            User.findOneAndUpdate(
                {_id: user.id}, {avatar: finalFileName, avatarurl: url}, {useFindAndModify: false},
                (error) => {
                    if (error) {
                        reject(error)
                    } else {
                        winston.debug('UserService.avatarUpload successful')
                        createUserAudit(user.id, user.id, 'avatarChange')
                        resolve({filename, mimetype, encoding, url})
                    }
                }
            );
        } else {
            winston.error("UserService.avatarUpload: upload fail")
            reject(new Error("Upload fail"))
        }

    })

}

function randomstring(length) {
    let result = '';
    let characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let charactersLength = characters.length;
    for (var i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}


export const findUsersGroup = function (group) {
    return new Promise((resolve, reject) => {
        User.find({groups: group.id}).then(users => {
            winston.debug('UserService.findUsersGroup successful')
            resolve(users)
        }).catch(err => {
            winston.error("UserService.findUsersGroup ", err)
            reject(err)
        })
    })
}


export const setUsersGroups = function (group, users) {

    function getDeletePromises(oldUsers) {
        return oldUsers.map((oldUser) => {
            let index = users.indexOf(oldUser.id)
            if (index !== -1) {
                users.splice(index, 1)
            } else {
                // console.log("Deleting user " + oldUser.username + ' for ' + group.id)
                return User.findOneAndUpdate(
                    {_id: oldUser.id},
                    {$pullAll: {groups: [group.id]}},
                    {new: true, runValidators: true, context: 'query'}
                )
            }
        });
    }

    function getPushPromises() {
        return users.map(user => {
            return User.findOneAndUpdate(
                {_id: user},
                {$push: {groups: group.id}},
                {new: true, runValidators: true, context: 'query'},
            )
        });
    }

    return new Promise(async (resolve, reject) => {


        findUsersGroup(group).then(oldUsers => {

            Promise.all(getDeletePromises(oldUsers)).then(() => {

                //2. Push group in new users
                let pushPromises = getPushPromises()

                Promise.all(pushPromises).then(() => {
                    winston.debug('UserService.setUsersGroups successful')
                    resolve(true)
                }).catch(err => reject(err))

            }).catch(err => {
                    winston.error("UserService.setUsersGroups ", err)
                    reject(err)
                }
            )

        }).catch(e => {

            winston.error("UserService.setUsersGroups.findUsersGroup ", e)
            reject(e)
        })

    })
}
