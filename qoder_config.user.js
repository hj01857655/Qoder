// ==UserScript==
// @name         Qoder 注册助手 - 配置版
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  在Qoder注册页面提供注册助手面板，支持自动注册功能（配置版 - 支持域名配置和临时邮箱服务）
// @author       hj0185765
// @match        https://qoder.com/*
// @match        https://*.qoder.com/*
// @grant        GM_xmlhttpRequest
// @updateURL    https://raw.githubusercontent.com/hj01857655/Qoder/master/qoder_config.user.js
// @downloadURL  https://raw.githubusercontent.com/hj01857655/Qoder/master/qoder_config.user.js
// ==/UserScript==

(function () {
    'use strict';

    // ==================== 常量定义 ====================
    const SELECTORS = {
        // 表单元素选择器
        firstName: 'input[id="basic_firstName"]',
        lastName: 'input[id="basic_lastName"]',
        email: 'input[id="basic_email"]',
        password: 'input[id="basic_password"]',
        captcha: '#captcha-element',
        continueBtn: 'button.ant-btn-primary, button[type="button"].ant-btn-primary',
        checkbox: 'input[class="ant-checkbox-input"][type="checkbox"]',
        otpInputs: '.ant-otp-input, input[aria-label^="OTP Input"]',

        // 验证码相关
        captchaCheckbox: '#aliyunCaptcha-checkbox-icon',
        captchaCheckedIcon: '.aliyunCaptcha-checkbox-icon-checked',
        captchaBody: '#aliyunCaptcha-checkbox-body',
        captchaText: '#aliyunCaptcha-checkbox-text',

        // 错误提示
        errorAlert: '.alert--cQdh1TE',
        verificationCode: '.verificationCode--o_u9MiU'
    };

    const CONFIG = {
        // 密码生成配置
        password: {
            minLength: 8,
            maxLength: 20,
            defaultLength: 12
        },

        // 临时邮箱配置
        tempEmail: {
            maxRetries: 20,
            retryDelay: 5000,
            verificationTimeout: 60000
        },

        // 人机验证配置
        captcha: {
            maxRetries: 3,
            timeout: 8000,
            mouseMoveDelay: 15,
            clickDelay: 4000
        },

        // UI配置
        ui: {
            maxLogs: 100,
            toastDuration: 3000,
            panelZIndex: 10002,
            buttonZIndex: 10001
        }
    };

    const STORAGE_KEYS = {
        config: 'qoder_config',
        accounts: 'qoder_accounts'
    };

    // ==================== 路径管理器 ====================
    const RouteManager = {
        // 路径定义
        paths: {
            signup: '/users/sign-up',
            signin: '/users/sign-in',
            home: '/',
            account: '/account/'
        },

        // 获取当前路径
        getCurrentPath() {
            return window.location.pathname;
        },

        // 获取当前完整URL
        getCurrentUrl() {
            return window.location.href;
        },

        // 检查是否在指定路径
        isAtPath(path) {
            return this.getCurrentPath() === path || this.getCurrentUrl().includes(path);
        },

        // 检查是否在注册页面
        isSignupPage() {
            return this.isAtPath(this.paths.signup);
        },

        // 检查是否在登录页面
        isSigninPage() {
            return this.isAtPath(this.paths.signin);
        },

        // 检查是否在首页
        isHomePage() {
            return this.isAtPath(this.paths.home);
        },

        // 检查是否在账户相关页面
        isAccountPage() {
            return this.isAtPath(this.paths.account);
        },

        // 检查是否在登录页面或首页
        isSigninOrHomePage() {
            return this.isSigninPage() || this.isHomePage();
        },

        // 跳转到指定路径
        navigateTo(path) {
            window.location.href = path;
        },

        // 跳转到注册页面
        navigateToSignup() {
            this.navigateTo(this.paths.signup);
        }
    };

    // ==================== 页面管理器 ====================
    const PageManager = {
        // 页面类型枚举
        pageTypes: {
            SIGNUP: 'signup',
            SIGNIN: 'signin',
            HOME: 'home',
            ACCOUNT: 'account',
            UNKNOWN: 'unknown'
        },

        // 获取当前页面类型
        getCurrentPageType() {
            if (RouteManager.isSignupPage()) {
                return this.pageTypes.SIGNUP;
            } else if (RouteManager.isSigninPage()) {
                return this.pageTypes.SIGNIN;
            } else if (RouteManager.isHomePage()) {
                return this.pageTypes.HOME;
            } else if (RouteManager.isAccountPage()) {
                return this.pageTypes.ACCOUNT;
            } else {
                return this.pageTypes.UNKNOWN;
            }
        },

        // 页面处理器映射
        pageHandlers: {
            signup: () => {
                Logger.info('在注册页面，开始注册助手...');
                setTimeout(() => {
                    // 创建悬浮按钮
                    createFloatingButton();
                    // 自动勾选复选框
                    autoCheckCheckbox();
                }, 2000);
            },
            signin: () => {
                Logger.info('在登录页面，添加注册助手入口...');
                setTimeout(() => {
                    GoToRegisterButton();
                }, 1000);
            },
            home: () => {
                Logger.info('在首页，添加注册助手入口...');
                setTimeout(() => {
                    GoToRegisterButton();
                }, 1000);
            },
            account: () => {
                Logger.info('在账户相关页面，隐藏注册助手按钮...');
                hideRegisterButtons();
            },
            unknown: () => {
                Logger.info('未知页面类型，跳过处理');
            }
        },

        // 处理当前页面
        handleCurrentPage() {
            const pageType = this.getCurrentPageType();
            const handler = this.pageHandlers[pageType];

            if (handler) {
                handler();
            } else {
                Logger.warning(`未找到页面类型 ${pageType} 的处理器`);
            }
        },

        // 检查是否应该显示注册面板
        shouldShowRegisterPanel() {
            return RouteManager.isSignupPage() && !RouteManager.isAccountPage();
        },

        // 检查是否应该显示登录页面按钮
        shouldShowSigninButton() {
            return RouteManager.isSigninOrHomePage() && !RouteManager.isAccountPage();
        }
    };

    // ==================== 工具函数 ====================
    const Utils = {
        // 防抖函数
        debounce(func, wait) {
            let timeout;
            return function executedFunction(...args) {
                const later = () => {
                    clearTimeout(timeout);
                    func(...args);
                };
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
            };
        },

        // 节流函数
        throttle(func, limit) {
            let inThrottle;
            return function () {
                const args = arguments;
                const context = this;
                if (!inThrottle) {
                    func.apply(context, args);
                    inThrottle = true;
                    setTimeout(() => inThrottle = false, limit);
                }
            };
        },

        // 安全的JSON解析
        safeJsonParse(str, defaultValue = null) {
            try {
                return JSON.parse(str);
            } catch (e) {
                console.warn('JSON解析失败:', e);
                return defaultValue;
            }
        },

        // 生成随机字符串
        randomString(length = 8) {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
            let result = '';
            for (let i = 0; i < length; i++) {
                result += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            return result;
        },

        // 等待元素出现
        waitForElement(selector, timeout = 10000) {
            return new Promise((resolve, reject) => {
                const element = document.querySelector(selector);
                if (element) {
                    resolve(element);
                    return;
                }

                const observer = new MutationObserver((mutations, obs) => {
                    const element = document.querySelector(selector);
                    if (element) {
                        obs.disconnect();
                        resolve(element);
                    }
                });

                observer.observe(document.body, {
                    childList: true,
                    subtree: true
                });

                setTimeout(() => {
                    observer.disconnect();
                    reject(new Error(`等待元素超时: ${selector}`));
                }, timeout);
            });
        }
    };

    // ==================== 密码生成器类 ====================
    class PasswordGenerator {
        constructor() {
            this.minLength = CONFIG.password.minLength;
            this.maxLength = CONFIG.password.maxLength;
            this.charSets = {
                lowercase: 'abcdefghijklmnopqrstuvwxyz',
                uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
                numbers: '0123456789'
            };
        }

        generate(length = CONFIG.password.defaultLength) {
            length = Math.max(this.minLength, Math.min(this.maxLength, length));

            let password = '';
            const requiredChars = [];

            // 确保包含必需的字符类型
            requiredChars.push(this.getRandomChar(this.charSets.lowercase));
            requiredChars.push(this.getRandomChar(this.charSets.uppercase));
            requiredChars.push(this.getRandomChar(this.charSets.numbers));

            // 生成剩余字符
            const remainingLength = length - requiredChars.length;
            const allChars = this.charSets.lowercase + this.charSets.uppercase + this.charSets.numbers;

            for (let i = 0; i < remainingLength; i++) {
                password += this.getRandomChar(allChars);
            }

            // 随机插入必需字符
            for (const char of requiredChars) {
                const randomIndex = Math.floor(Math.random() * (password.length + 1));
                password = password.slice(0, randomIndex) + char + password.slice(randomIndex);
            }

            return password;
        }

        getRandomChar(charSet) {
            return charSet.charAt(Math.floor(Math.random() * charSet.length));
        }

        validate(password) {
            const errors = [];

            if (password.length < this.minLength) {
                errors.push(`密码长度不能少于${this.minLength}个字符`);
            }
            if (password.length > this.maxLength) {
                errors.push(`密码长度不能超过${this.maxLength}个字符`);
            }
            if (!/[a-z]/.test(password)) {
                errors.push('密码必须包含至少一个小写字母');
            }
            if (!/[A-Z]/.test(password)) {
                errors.push('密码必须包含至少一个大写字母');
            }
            if (!/\d/.test(password)) {
                errors.push('密码必须包含至少一个数字');
            }

            return {
                isValid: errors.length === 0,
                errors
            };
        }
    }

    // ==================== 配置管理器类 ====================
    class ConfigManager {
        constructor() {
            this.config = this.loadConfig();
        }

        getDefaultConfig() {
            return {
                customDomains: [],
                autoFetchVerificationCode: true,
                tempEmailConfig: {
                    tempmail: '',
                    epin: '',
                    first_id: ''
                }
            };
        }

        loadConfig() {
            const saved = localStorage.getItem(STORAGE_KEYS.config);
            if (saved) {
                const parsed = Utils.safeJsonParse(saved);
                if (parsed) {
                    return { ...this.getDefaultConfig(), ...parsed };
                }
            }
            return this.getDefaultConfig();
        }

        saveConfig() {
            localStorage.setItem(STORAGE_KEYS.config, JSON.stringify(this.config));
        }

        updateConfig(newConfig) {
            this.config = { ...this.config, ...newConfig };
            this.saveConfig();
        }

        getCustomDomains() {
            return this.config.customDomains || [];
        }

        isAutoFetchEnabled() {
            return this.config.autoFetchVerificationCode !== false;
        }

        getTempEmailConfig() {
            return this.config.tempEmailConfig || {};
        }

        // 保存注册成功的账号信息
        saveAccount(accountInfo) {
            try {
                const accounts = this.getAccounts();
                const accountId = Date.now().toString();

                const accountData = {
                    id: accountId,
                    ...accountInfo,
                    createdAt: new Date().toISOString(),
                    status: 'active'
                };

                accounts.push(accountData);
                localStorage.setItem(STORAGE_KEYS.accounts, JSON.stringify(accounts));

                Logger.success(`✅ 账号保存成功: ${accountInfo.email}`);
                return accountId;
            } catch (error) {
                Logger.error(`❌ 保存账号失败: ${error.message}`);
                return null;
            }
        }

        // 获取所有保存的账号
        getAccounts() {
            try {
                const saved = localStorage.getItem(STORAGE_KEYS.accounts);
                return saved ? Utils.safeJsonParse(saved) || [] : [];
            } catch (error) {
                Logger.error(`❌ 获取账号列表失败: ${error.message}`);
                return [];
            }
        }

        // 删除指定账号
        deleteAccount(accountId) {
            try {
                const accounts = this.getAccounts();
                const filteredAccounts = accounts.filter(account => account.id !== accountId);
                localStorage.setItem(STORAGE_KEYS.accounts, JSON.stringify(filteredAccounts));

                Logger.success(`✅ 账号删除成功: ${accountId}`);
                return true;
            } catch (error) {
                Logger.error(`❌ 删除账号失败: ${error.message}`);
                return false;
            }
        }

        // 更新账号状态
        updateAccountStatus(accountId, status) {
            try {
                const accounts = this.getAccounts();
                const accountIndex = accounts.findIndex(account => account.id === accountId);

                if (accountIndex !== -1) {
                    accounts[accountIndex].status = status;
                    accounts[accountIndex].updatedAt = new Date().toISOString();
                    localStorage.setItem(STORAGE_KEYS.accounts, JSON.stringify(accounts));

                    Logger.success(`✅ 账号状态更新成功: ${accountId} -> ${status}`);
                    return true;
                }

                return false;
            } catch (error) {
                Logger.error(`❌ 更新账号状态失败: ${error.message}`);
                return false;
            }
        }

        validateConfig() {
            const errors = [];

            if (!this.config.customDomains || this.config.customDomains.length === 0) {
                errors.push('未配置自定义域名');
            }

            if (!this.config.tempEmailConfig || !this.config.tempEmailConfig.tempmail) {
                errors.push('未配置tempmail.plus服务');
            }

            return {
                isValid: errors.length === 0,
                errors
            };
        }
    }

    // ==================== 临时邮箱管理器类 ====================
    class TempEmailManager {
        constructor() {
            this.currentEmail = null;
            this.first_id = null;
            this.maxRetries = CONFIG.tempEmail.maxRetries;
            this.retryDelay = CONFIG.tempEmail.retryDelay;
        }

        async makeApiRequest(url, email, epin = '') {
            return new Promise((resolve, reject) => {
                Logger.debug(`🌐 API请求: ${url}`);

                GM_xmlhttpRequest({
                    method: 'GET',
                    url: url,
                    headers: {
                        'accept': 'application/json, text/javascript, */*; q=0.01',
                        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
                        'cache-control': 'no-cache',
                        'pragma': 'no-cache',
                        'sec-fetch-dest': 'empty',
                        'sec-fetch-mode': 'cors',
                        'sec-fetch-site': 'same-origin',
                        'x-requested-with': 'XMLHttpRequest',
                        'cookie': `email=${email}`,
                        'Referer': 'https://tempmail.plus/zh/'
                    },
                    onload: function (response) {
                        Logger.debug(`📡 API响应状态: ${response.status}`);

                        if (response.status === 404) {
                            Logger.error(`API请求返回404，邮件可能不存在或API路径错误`);
                            reject(new Error(`API请求返回404，邮件可能不存在或API路径错误`));
                            return;
                        }

                        if (response.status !== 200) {
                            Logger.error(`API请求失败，HTTP状态码: ${response.status}`);
                            reject(new Error(`API请求失败，HTTP状态码: ${response.status}`));
                            return;
                        }

                        try {
                            const data = JSON.parse(response.responseText);

                            if (!data.result && data.err) {
                                if (data.err.code === 1021 && data.err.msg === "Pin not valid.") {
                                    Logger.error('epin无效，请检查epin配置');
                                    reject(new Error('epin无效，请检查epin配置'));
                                    return;
                                }
                                Logger.error(`tempmail API错误: ${data.err.msg}`);
                                reject(new Error(`tempmail API错误: ${data.err.msg}`));
                                return;
                            }
                            Logger.debug(data);
                            resolve(data);
                        } catch (error) {
                            Logger.error(`JSON解析失败: ${error.message}`);
                            reject(new Error(`解析响应失败: ${error.message}`));
                        }
                    },
                    onerror: function (error) {
                        Logger.error(`API请求失败: HTTP ${error.status}: ${error.statusText}`);
                        reject(new Error(`HTTP ${error.status}: ${error.statusText}`));
                    }
                });
            });
        }

        async getMailList(email, epin = '', limit = 20) {
            const url = `https://tempmail.plus/api/mails?email=${email}&limit=${limit}&epin=${epin}`;
            return await this.makeApiRequest(url, email, epin);
        }

        async getNewMails(email, epin = '', firstId = null) {
            // 获取新邮件的API - 基于first_id参数
            let url = `https://tempmail.plus/api/mails?email=${email}&epin=${epin}&limit=50`;
            if (firstId) {
                url += `&first_id=${firstId}`;
            }
            return await this.makeApiRequest(url, email, epin);
        }

        async getUnreadMails(email, epin = '') {
            // 获取未读邮件的API
            const url = `https://tempmail.plus/api/mails?email=${email}&epin=${epin}&unread=true&limit=50`;
            return await this.makeApiRequest(url, email, epin);
        }

        async getMailDetail(mailId, email, epin = '') {
            const url = `https://tempmail.plus/api/mails/${mailId}?email=${email}&epin=${epin}`;
            return await this.makeApiRequest(url, email, epin);
        }

        async deleteMail(mailId, email, epin = '') {
            const url = `https://tempmail.plus/api/mails/${mailId}?email=${email}&epin=${epin}`;
            return await this.makeApiRequest(url, email, epin);
        }

        // 改进的验证码提取逻辑
        extractVerificationCode(text) {
            if (!text) {
                Logger.debug(`🔍 文本内容为空，无法提取验证码`);
                return null;
            }



            // 多种验证码格式匹配
            const patterns = [
                // 优先匹配6位数字（最常见的验证码格式）
                /\b(\d{6})\b/,                         // 6位数字
                // 匹配4-8位数字
                /\b(\d{4,8})\b/,                       // 4-8位数字
                // 匹配带标签的验证码
                /verification[:\s]*(\d{4,8})/i,       // verification: 123456
                /code[:\s]*(\d{4,8})/i,               // code: 123456
                /otp[:\s]*(\d{4,8})/i,                // otp: 123456
                /pin[:\s]*(\d{4,8})/i,                // pin: 123456
                // 匹配验证码前后的文本
                /(\d{4,8})[^a-zA-Z]*verification/i,   // 123456 verification
                /(\d{4,8})[^a-zA-Z]*code/i,           // 123456 code
                /(\d{4,8})[^a-zA-Z]*otp/i,            // 123456 otp
                /(\d{4,8})[^a-zA-Z]*pin/i             // 123456 pin
            ];

            for (let i = 0; i < patterns.length; i++) {
                const pattern = patterns[i];
                const match = text.match(pattern);
                if (match) {
                    const code = match[1] || match[0];

                    return code;
                }
            }

            // 查找所有可能的数字序列
            const allNumbers = text.match(/\d{4,8}/g);
            if (allNumbers) {
                // 返回第一个4-8位数字
                return allNumbers[0];
            }
            return null;
        }

        // 改进的邮件匹配逻辑
        isTargetEmail(mail, targetEmail) {
            if (!targetEmail) return true; // 如果没有指定目标邮箱，匹配所有邮件

            Logger.debug(`📧 检查邮件匹配 - 目标邮箱: ${targetEmail}`);

            // 调试：输出完整的邮件对象结构


            // 尝试多种可能的字段名
            const toField = mail.to || mail.to_address || mail.recipient || mail.recipient_address;
            const fromField = mail.from || mail.from_address || mail.sender || mail.sender_address;
            const subjectField = mail.subject || mail.title || mail.topic;



            // 提取邮箱地址的辅助函数
            const extractEmail = (emailString) => {
                if (!emailString) return '';


                // 处理格式如 "<quickstar2172@yanabc.com>" 的情况
                const match = emailString.match(/<([^>]+)>/);
                if (match) {
                    const extracted = match[1];

                    return extracted;
                }

                // 如果没有尖括号，直接返回

                return emailString;
            };

            // 检查to字段
            if (toField) {
                const extractedTo = extractEmail(toField);
                if (extractedTo.toLowerCase() === targetEmail.toLowerCase()) {
                    return true;
                }
            }

            // 检查from字段
            if (fromField) {
                const extractedFrom = extractEmail(fromField);
                if (extractedFrom.toLowerCase() === targetEmail.toLowerCase()) {
                    return true;
                }
            }

            // 检查subject字段（通常不包含邮箱，但保留检查）
            if (subjectField && subjectField.toLowerCase().includes(targetEmail.toLowerCase())) {

                return true;
            }

            // 检查邮件内容
            const content = (mail.text || mail.html || mail.content || '');
            if (content && content.toLowerCase().includes(targetEmail.toLowerCase())) {

                return true;
            }


            return false;
        }

        // 改进的验证码获取逻辑
        async getVerificationCode(timeout = CONFIG.tempEmail.verificationTimeout, targetEmail = null) {
            const tempEmailConfig = ConfigManagerSingleton.getInstance().getTempEmailConfig();
            const tempmail = tempEmailConfig.tempmail;
            const epin = tempEmailConfig.epin;

            if (!tempmail) {
                throw new Error('未配置tempmail.plus服务');
            }

            this.currentEmail = tempmail;
            Logger.info(`📧 开始监控邮箱: ${tempmail}`);
            if (targetEmail) {
                Logger.info(`🎯 目标邮箱: ${targetEmail}`);
            }
            if (epin) {
                Logger.info(`🔑 使用epin: ${epin}`);
            }

                        const startTime = Date.now();
            let lastFirstId = null; // 记录上次的first_id

            while (Date.now() - startTime < timeout) {
                try {
                    Logger.debug(`🔄 获取新邮件...`);

                    // 使用first_id机制获取新邮件
                    let mailListData;
                    if (lastFirstId) {
                        // 使用first_id获取新邮件
                        mailListData = await this.getNewMails(tempmail, epin, lastFirstId);
                        Logger.debug(`📧 使用first_id=${lastFirstId}获取新邮件`);

                        // 检查API响应结构，支持不同的字段名
                        const mailList = mailListData.mail_list || mailListData.result || [];

                        if (mailList && mailList.length > 0) {
                            Logger.info(`📧 获取到 ${mailList.length} 封新邮件`);

                            // 只处理新邮件（is_new=true）
                            const newMails = mailList.filter(mail => mail.is_new === true);

                            if (newMails.length > 0) {
                                Logger.info(`📈 发现 ${newMails.length} 封新邮件，开始处理`);

                                // 按时间倒序排列新邮件
                                const sortedNewMails = newMails.sort((a, b) => {
                                    const timeA = new Date(a.time || a.date || 0).getTime();
                                    const timeB = new Date(b.time || b.date || 0).getTime();
                                    return timeB - timeA;
                                });

                                // 只处理新邮件
                                for (const mail of sortedNewMails) {
                                    const mailId = mail.mail_id || mail.id || mail.mailId;

                                    Logger.debug(`📧 处理新邮件ID: ${mailId}, 时间: ${mail.time}`);

                                    // 获取邮件详情
                                    try {
                                        const mailDetail = await this.getMailDetail(mailId, tempmail, epin);
                                        Logger.debug(`📧 获取邮件详情成功`);

                                        // 检查是否匹配目标邮箱
                                        if (!this.isTargetEmail(mailDetail, targetEmail)) {
                                            Logger.debug(`❌ 邮件不匹配目标邮箱，跳过`);
                                            continue;
                                        }

                                        Logger.info(`✅ 邮件匹配成功，开始提取验证码`);

                                        // 提取验证码
                                        const content = mailDetail.text || mailDetail.html || '';
                                        Logger.debug(`📧 邮件内容长度: ${content.length}`);

                                        const verificationCode = this.extractVerificationCode(content);

                                        if (verificationCode) {
                                            Logger.success(`✅ 找到验证码: ${verificationCode}`);
                                            Logger.info(`📧 邮件来源: ${mailDetail.from || '未知'}`);
                                            Logger.info(`📧 邮件主题: ${mailDetail.subject || '无主题'}`);
                                            return verificationCode;
                                        } else {
                                            Logger.debug(`🔍 邮件中未找到验证码`);
                                        }
                                    } catch (error) {
                                        Logger.error(`❌ 获取邮件详情失败: ${error.message}`);
                                    }
                                }
                            } else {
                                Logger.debug(`📧 没有新邮件`);
                            }
                        } else {
                            Logger.debug(`📧 新邮件列表为空`);
                        }
                    } else {
                        // 第一次调用，只获取first_id，不处理邮件
                        mailListData = await this.getMailList(tempmail, epin, 50);
                        Logger.debug(`📧 首次获取邮件列表，仅用于获取first_id`);
                    }

                    // 更新first_id用于下次请求
                    if (mailListData.first_id) {
                        lastFirstId = mailListData.first_id;
                        Logger.debug(`📧 更新first_id: ${lastFirstId}`);
                    }

                    // 固定10秒间隔重试
                    const delay = 10000;
                    Logger.debug(`⏳ 等待 ${delay}ms 后重试...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                } catch (error) {
                    Logger.error(`❌ 获取邮件列表失败: ${error.message}`);

                    // 错误时等待10秒后重试
                    const errorDelay = 10000;
                    Logger.debug(`⏳ 错误后等待 ${errorDelay}ms 重试...`);
                    await new Promise(resolve => setTimeout(resolve, errorDelay));
                }
            }

            Logger.error(`❌ 验证码获取超时 (${timeout}ms)`);
            return null;
        }

        // 新增：测试邮箱连接
        async testEmailConnection() {
            const tempEmailConfig = ConfigManagerSingleton.getInstance().getTempEmailConfig();
            const tempmail = tempEmailConfig.tempmail;
            const epin = tempEmailConfig.epin;

            if (!tempmail) {
                throw new Error('未配置tempmail.plus服务');
            }

            try {
                Logger.info(`🧪 测试邮箱连接: ${tempmail}`);
                const mailListData = await this.getMailList(tempmail, epin, 5);

                const mailList = mailListData.mail_list || mailListData.result || [];
                if (mailList && mailList.length >= 0) {
                    Logger.success(`✅ 邮箱连接测试成功，当前邮件数量: ${mailList.length}`);
                    return true;
                } else {
                    Logger.warning(`⚠️ 邮箱连接测试返回空结果`);
                    return false;
                }
            } catch (error) {
                Logger.error(`❌ 邮箱连接测试失败: ${error.message}`);
                return false;
            }
        }

        // 新增：获取邮箱状态
        async getEmailStatus() {
            const tempEmailConfig = ConfigManagerSingleton.getInstance().getTempEmailConfig();
            const tempmail = tempEmailConfig.tempmail;
            const epin = tempEmailConfig.epin;

            if (!tempmail) {
                return { connected: false, message: '未配置邮箱' };
            }

            try {
                const mailListData = await this.getMailList(tempmail, epin, 10);
                const mailList = mailListData.mail_list || mailListData.result || [];
                return {
                    connected: true,
                    email: tempmail,
                    mailCount: mailList.length,
                    lastMail: mailList.length > 0 ?
                        mailList[0].time || mailList[0].date : null
                };
            } catch (error) {
                return {
                    connected: false,
                    email: tempmail,
                    error: error.message
                };
            }
        }
    }

    // ==================== 日志管理器类 ====================
    class Logger {
        static logCount = 0;
        static maxLogs = CONFIG.ui.maxLogs;

        static addLog(message, type = 'info') {
            const logContainer = document.getElementById('log-container');
            const logCountElement = document.getElementById('log-count');

            if (!logContainer) return;

            const timestamp = new Date().toLocaleTimeString();
            const typeColors = {
                'info': '#00ff00',
                'success': '#00ff00',
                'warning': '#ffff00',
                'error': '#ff0000',
                'debug': '#888888'
            };

            const color = typeColors[type] || '#00ff00';
            const icon = {
                'info': 'ℹ️',
                'success': '✅',
                'warning': '⚠️',
                'error': '❌',
                'debug': '🔍'
            }[type] || 'ℹ️';

            const logEntry = document.createElement('div');
            logEntry.style.cssText = `
                color: ${color};
                margin-bottom: 4px;
                word-wrap: break-word;
            `;
            logEntry.innerHTML = `<span style="color: #888;">[${timestamp}]</span> ${icon} ${message}`;

            logContainer.appendChild(logEntry);
            this.logCount++;

            if (logCountElement) {
                logCountElement.textContent = `${this.logCount} 条记录`;
            }

            logContainer.scrollTop = logContainer.scrollHeight;

            if (logContainer.children.length > this.maxLogs) {
                logContainer.removeChild(logContainer.firstChild);
            }

            console.log(`[${timestamp}] ${message}`);
        }

        static info(message) {
            this.addLog(message, 'info');
        }

        static success(message) {
            this.addLog(message, 'success');
        }

        static warning(message) {
            this.addLog(message, 'warning');
        }

        static error(message) {
            this.addLog(message, 'error');
        }

        static debug(message) {
            this.addLog(message, 'debug');
        }

        static clear() {
            const logContainer = document.getElementById('log-container');
            const logCountElement = document.getElementById('log-count');

            if (logContainer) {
                logContainer.innerHTML = '<div style="color: #888;">日志已清空...</div>';
            }

            if (logCountElement) {
                logCountElement.textContent = '0 条记录';
            }

            this.logCount = 0;
            this.info('日志已清空');
        }
    }

    // ==================== 单例模式管理器 ====================
    const ConfigManagerSingleton = (function () {
        let instance = null;

        return {
            getInstance() {
                if (!instance) {
                    instance = new ConfigManager();
                }
                return instance;
            }
        };
    })();

    // 创建全局实例
    const passwordGenerator = new PasswordGenerator();
    const configManager = ConfigManagerSingleton.getInstance();
    const tempEmailManager = new TempEmailManager();

    // ==================== 用户名生成器 ====================
    function generateFirstName() {
        const firstNames = [
            'Alex', 'Jordan', 'Taylor', 'Casey', 'Morgan', 'Riley', 'Quinn', 'Avery', 'Blake', 'Cameron',
            'Drew', 'Emery', 'Finley', 'Gray', 'Harper', 'Indigo', 'Jamie', 'Kendall', 'Logan', 'Mason',
            'Noah', 'Oakley', 'Parker', 'Quinn', 'River', 'Sage', 'Tatum', 'Unity', 'Vale', 'Winter',
            'Xander', 'Yuki', 'Zion', 'Aria', 'Bella', 'Chloe', 'Diana', 'Emma', 'Fiona', 'Grace',
            'Hannah', 'Iris', 'Jade', 'Kate', 'Luna', 'Maya', 'Nova', 'Olivia', 'Penny', 'Ruby'
        ];
        return firstNames[Math.floor(Math.random() * firstNames.length)];
    }

    function generateLastName() {
        const lastNames = [
            'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
            'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin',
            'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson',
            'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores',
            'Green', 'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell', 'Carter', 'Roberts'
        ];
        return lastNames[Math.floor(Math.random() * lastNames.length)];
    }

    // 生成随机邮箱
    function generateRandomEmail(domain) {
        const adjectives = ['cool', 'smart', 'happy', 'bright', 'quick', 'fast', 'super', 'mega', 'ultra', 'pro'];
        const nouns = ['coder', 'dev', 'hacker', 'geek', 'ninja', 'master', 'guru', 'wizard', 'hero', 'star'];
        const numbers = Math.floor(Math.random() * 10000);

        const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
        const noun = nouns[Math.floor(Math.random() * nouns.length)];

        return `${adjective}${noun}${numbers}@${domain}`;
    }

    // 邮箱生成器 - 配置版
    async function generateEmail() {
        // 只使用自定义域名模式
        Logger.info('📧 使用自定义域名模式');
        const customDomains = configManager.getCustomDomains();

        if (customDomains.length === 0) {
            Logger.error('❌ 未配置自定义域名，请先在配置面板中设置域名');
            return null;
        }

        const selectedCustomDomain = customDomains[Math.floor(Math.random() * customDomains.length)];
        const customEmail = generateRandomEmail(selectedCustomDomain);
        Logger.success(`✅ 生成自定义域名邮箱: ${customEmail}`);
        return customEmail;
    }

    // 改进的输入值设置方法 - 针对React Ant Design表单
    function setInputValue(input, value) {
        Logger.info(`🔧 开始设置 ${input.id} 的值为: ${value}`);

        let successMethod = '未知';
        let originalValue = input.value;

        // 清空现有值
        input.value = '';
        input.focus();
        input.select();

        // 直接调用React的onChange回调
        try {
            Logger.info('🔄直接调用React onChange');
            // 查找React组件实例
            const reactKey = Object.keys(input).find(key => key.startsWith('__reactProps$'));
            if (reactKey && input[reactKey] && input[reactKey].onChange) {
                Logger.info('找到React组件实例，调用onChange');
                input[reactKey].onChange({
                    target: { value: value },
                    currentTarget: { value: value },
                    type: 'change'
                });
                if (input.value === value && successMethod === '未知') {
                    successMethod = ' 直接调用React onChange';
                    Logger.success(`✅ ${successMethod} 成功`);
                }
            } else {
                Logger.error('❌ 未找到React组件实例或onChange回调');
            }
        } catch (e) {
            Logger.error('❌ React onChange调用失败:', e);
        }

        // 最终验证和报告
        setTimeout(() => {
            Logger.info(`📊 ${input.id} 最终验证结果:`);
            Logger.info(`   原始值: "${originalValue}"`);
            Logger.info(`   目标值: "${value}"`);
            Logger.info(`   当前值: "${input.value}"`);
            Logger.info(`   是否成功: ${input.value === value ? '✅ 是' : '❌ 否'}`);

        }, 100);
    }

    // 去注册按钮
    function GoToRegisterButton() {
        // 检查是否已经存在按钮
        if (document.getElementById('qoder-signin-btn')) {
            return;
        }

        const button = document.createElement('div');
        button.id = 'qoder-signin-btn';
        button.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: ${CONFIG.ui.buttonZIndex};
            background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
            color: white;
            border: none;
            border-radius: 8px;
            padding: 12px 20px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            box-shadow: 0 4px 20px rgba(0,0,0,0.15);
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            gap: 8px;
        `;

        button.innerHTML = '⚙️ 去注册（配置版）';

        // 添加悬停效果
        button.addEventListener('mouseenter', () => {
            button.style.transform = 'translateY(-2px)';
            button.style.boxShadow = '0 6px 25px rgba(0,0,0,0.2)';
        });

        button.addEventListener('mouseleave', () => {
            button.style.transform = 'translateY(0)';
            button.style.boxShadow = '0 4px 20px rgba(0,0,0,0.15)';
        });

        // 点击跳转到注册页面
        button.addEventListener('click', () => {
            Logger.info('点击注册助手入口，跳转到注册页面');
            RouteManager.navigateToSignup();
        });

        document.body.appendChild(button);
        Logger.info('创建登录页面注册助手入口按钮');
    }

    // 注册面板
    function RegisterPanel() {
        const panel = document.createElement('div');
        panel.id = 'qoder-register-panel';
        panel.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: ${CONFIG.ui.panelZIndex};
            background: rgba(255, 255, 255, 0.98);
            backdrop-filter: blur(15px);
            padding: 24px;
            border-radius: 16px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.2);
            border: 1px solid rgba(255,255,255,0.3);
            min-width: 450px;
            max-width: 600px;
            max-height: 80vh;
            display: none;
            overflow: hidden;
        `;

        panel.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h3 style="margin: 0; color: #333; font-size: 18px;">⚙️ Qoder 注册助手 - 配置版</h3>
                <div style="display: flex; gap: 8px;">
                    <button id="clear-logs" style="background: #ff9800; color: white; border: none; border-radius: 4px; padding: 4px 8px; font-size: 12px; cursor: pointer;">清空日志</button>
                    <button id="close-register-panel" style="background: none; border: none; color: #666; font-size: 20px; cursor: pointer; padding: 0; width: 24px; height: 24px;">×</button>
                </div>
            </div>

            <div style="margin-bottom: 12px;">
                <button id="start-register" style="width: 100%; padding: 12px; background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%); color: white; border: none; border-radius: 8px; font-weight: 500; cursor: pointer; transition: all 0.3s ease;">开始注册</button>
            </div>



            <div style="margin-bottom: 12px;">
                <button id="open-config" style="width: 100%; padding: 8px; background: linear-gradient(135deg, #2196F3 0%, #1976D2 100%); color: white; border: none; border-radius: 6px; font-size: 12px; cursor: pointer; transition: all 0.3s ease;">⚙️ 配置设置</button>
            </div>

            <div id="current-stage" style="margin-bottom: 16px; padding: 12px; background: #f5f5f5; border-radius: 6px; font-size: 14px; color: #666;">
                <div style="margin-bottom: 8px;">📊 当前阶段:</div>
                <div id="stage-info">检测中...</div>
            </div>

            <div style="margin-bottom: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <span style="font-weight: 500; color: #333;">📝 操作日志</span>
                    <span id="log-count" style="font-size: 12px; color: #666;">0 条记录</span>
                </div>
                <div id="log-container" style="
                    height: 200px;
                    background: #1e1e1e;
                    border-radius: 6px;
                    padding: 12px;
                    font-family: 'Courier New', monospace;
                    font-size: 12px;
                    color: #00ff00;
                    overflow-y: auto;
                    border: 1px solid #333;
                    line-height: 1.4;
                ">
                    <div style="color: #888;">等待开始注册...</div>
                </div>
            </div>
        `;

        return panel;
    }

    // 创建注册面板
    function createRegisterPanel() {
        return RegisterPanel();
    }

    // 创建悬浮按钮
    function createFloatingButton() {
        // 检查是否已经存在悬浮按钮
        if (document.getElementById('qoder-floating-btn')) {
            return;
        }

        const button = document.createElement('div');
        button.id = 'qoder-floating-btn';
        button.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: ${CONFIG.ui.buttonZIndex};
            width: 50px;
            height: 50px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            box-shadow: 0 4px 20px rgba(0,0,0,0.15);
            transition: all 0.3s ease;
            font-size: 20px;
            color: white;
            font-weight: bold;
        `;

        button.innerHTML = '🚀';
        button.title = '打开注册助手面板';

        // 添加悬停效果
        button.addEventListener('mouseenter', () => {
            button.style.transform = 'scale(1.1)';
            button.style.boxShadow = '0 6px 25px rgba(0,0,0,0.2)';
        });

        button.addEventListener('mouseleave', () => {
            button.style.transform = 'scale(1)';
            button.style.boxShadow = '0 4px 20px rgba(0,0,0,0.15)';
        });

        // 点击打开面板
        button.addEventListener('click', () => {
            showRegisterPanel();
        });

        document.body.appendChild(button);
        Logger.info('✅ 创建悬浮按钮成功');
    }

    // 隐藏注册助手按钮
    function hideRegisterButtons() {
        // 隐藏悬浮按钮
        const floatingBtn = document.getElementById('qoder-floating-btn');
        if (floatingBtn) {
            floatingBtn.style.display = 'none';
        }

        // 隐藏注册面板
        const registerPanel = document.getElementById('qoder-register-panel');
        if (registerPanel) {
            registerPanel.style.display = 'none';
        }

        // 隐藏登录页面的注册入口按钮
        const signinBtn = document.getElementById('qoder-signin-btn');
        if (signinBtn) {
            signinBtn.style.display = 'none';
        }

        // 隐藏验证码获取按钮
        const verificationBtn = document.getElementById('qoder-verification-btn');
        if (verificationBtn) {
            verificationBtn.style.display = 'none';
        }

        // 隐藏配置面板
        const configPanel = document.getElementById('qoder-config-panel');
        if (configPanel) {
            configPanel.style.display = 'none';
        }

        Logger.info('已隐藏所有注册助手按钮');
    }

    // 打开注册面板按钮（保留兼容性）
    function OpenRegisterPanelButton() {
        return createFloatingButton();
    }

    // 自动勾选复选框
    function autoCheckCheckbox() {
        const checkbox = document.querySelector(SELECTORS.checkbox);
        Logger.info('查找复选框元素:', checkbox);

        if (checkbox && !checkbox.checked) {
            Logger.info('自动勾选复选框:', checkbox);
            checkbox.click();
            Logger.info('自动勾选复选框完成');
        } else if (checkbox && checkbox.checked) {
            Logger.info('复选框勾选成功');
        } else {
            Logger.info('未找到复选框');
        }
    }

    // 检测注册页面
    function isSignupPage() {
        // 检测是否在注册页面
        if (!RouteManager.isSignupPage()) {
            Logger.info('不在注册页面，跳过注册面板');
            return;
        }

        Logger.info('在注册页面，开始注册助手...');
        setTimeout(() => {
            autoCheckCheckbox();
        }, 2000);
    }

    // 检测登录页面
    function isSigninPageOrHomePage() {
        // 如果不在登录页面或者首页，则返回
        if (!RouteManager.isSigninOrHomePage()) {
            return;
        }

        Logger.info('在登录页面，添加注册助手入口...');

        // 等待页面元素加载
        setTimeout(() => {
            GoToRegisterButton();
        }, 1000);
    }


    // 显示注册助手面板
    function showRegisterPanel() {
        // 只在注册页面显示
        if (!PageManager.shouldShowRegisterPanel()) {
            return;
        }

        let panel = document.getElementById('qoder-register-panel');
        if (!panel) {
            panel = createRegisterPanel();
            document.body.appendChild(panel);

            // 绑定事件
            document.getElementById('close-register-panel').addEventListener('click', hideRegisterPanel);
            document.getElementById('start-register').addEventListener('click', startRegistration);
            document.getElementById('clear-logs').addEventListener('click', clearLogs);
            document.getElementById('open-config').addEventListener('click', showConfigPanel);

            Logger.info('创建注册面板');
        }

        panel.style.display = 'block';

        // 隐藏悬浮按钮
        const floatingBtn = document.getElementById('qoder-floating-btn');
        if (floatingBtn) {
            floatingBtn.style.display = 'none';
        }

        // 如果在验证码页面，显示验证码获取按钮
        const currentStage = detectCurrentStage();
        if (currentStage === 'otp') {
            createVerificationCodeButton();
        }

        // 启动阶段监控（避免重复设置）
        if (!window.stageMonitorInterval) {
            updateCurrentStage();
            window.stageMonitorInterval = setInterval(() => {
                updateCurrentStage();
                // 检查是否在验证码页面，如果是则创建验证码获取按钮
                const currentStage = detectCurrentStage();
                if (currentStage === 'otp') {
                    createVerificationCodeButton();
                }
            }, 2000);
        }

        // 添加初始日志
        Logger.info('面板已打开，等待开始注册...');
    }
    // 隐藏注册助手面板
    function hideRegisterPanel() {
        const panel = document.getElementById('qoder-register-panel');
        if (panel) {
            panel.style.display = 'none';
        }

        // 显示悬浮按钮
        const floatingBtn = document.getElementById('qoder-floating-btn');
        if (floatingBtn) {
            floatingBtn.style.display = 'flex';
        }

        // 隐藏验证码获取按钮
        const verificationBtn = document.getElementById('qoder-verification-btn');
        if (verificationBtn) {
            verificationBtn.style.display = 'none';
        }
    }
     // 创建配置面板
     function createConfigPanel() {
        const panel = document.createElement('div');
        panel.id = 'qoder-config-panel';
        panel.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            z-index: 10003;
            background: rgba(255, 255, 255, 0.98);
            backdrop-filter: blur(15px);
            padding: 24px;
            border-radius: 16px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.2);
            border: 1px solid rgba(255,255,255,0.3);
            min-width: 500px;
            max-width: 600px;
            max-height: 80vh;
            display: none;
            overflow-y: auto;
        `;

        const config = configManager.config;

        panel.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h3 style="margin: 0; color: #333; font-size: 18px;">⚙️ 配置设置</h3>
                <button id="close-config-panel" style="background: none; border: none; color: #666; font-size: 20px; cursor: pointer; padding: 0; width: 24px; height: 24px;">×</button>
            </div>

            <div style="margin-bottom: 20px;">
                <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #333;">📧 邮箱生成模式:</label>
                <div style="padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; background: #f5f5f5; color: #666;">
                    自定义域名模式（使用用户配置的域名生成邮箱）
                </div>
            </div>

                         <div style="margin-bottom: 20px;">
                 <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #333;">🌐 自定义邮箱域名 (每行一个):</label>
                 <textarea id="custom-domains" style="width: 100%; height: 80px; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; resize: vertical;">${(config.customDomains || []).join('\n')}</textarea>
                 <small style="color: #666; font-size: 12px;">例如: example.com, mydomain.com</small>
             </div>



            <div style="margin-bottom: 20px;">
                <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #333;">🔑 临时邮箱服务配置:</label>
                                 <div style="margin-bottom: 15px;">
                     <h4 style="margin: 0 0 8px 0; color: #333; font-size: 14px;">临时邮箱服务配置:</h4>
                                         <div style="margin-bottom: 8px;">
                        <input type="text" id="tempmail" value="${(config.tempEmailConfig && config.tempEmailConfig.tempmail) || ''}" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;" placeholder="tempmail.plus 配置" style="::placeholder { color: #999; }">
                    </div>
                    <div style="margin-bottom: 8px;">
                        <input type="text" id="epin" value="${(config.tempEmailConfig && config.tempEmailConfig.epin) || ''}" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;" placeholder="epin 配置" style="::placeholder { color: #999; }">
                    </div>
                 </div>

                <small style="color: #666; font-size: 12px;">用于接收自定义域名邮箱转发过来的验证码</small>
            </div>

            <div style="margin-bottom: 20px;">
                <label style="display: flex; align-items: center; margin-bottom: 8px; font-weight: 500; color: #333;">
                    <input type="checkbox" id="auto-fetch" ${config.autoFetchVerificationCode ? 'checked' : ''} style="margin-right: 8px;">
                    自动获取验证码 (通过tempmail.plus接收)
                </label>
            </div>

            <div style="display: flex; gap: 10px; justify-content: flex-end;">
                <button id="view-saved-accounts" style="padding: 10px 20px; background: linear-gradient(135deg, #2196F3 0%, #1976D2 100%); color: white; border: none; border-radius: 6px; font-size: 14px; cursor: pointer;">📚 查看账号</button>
                <button id="test-stage-detection" style="padding: 10px 20px; background: linear-gradient(135deg, #9C27B0 0%, #7B1FA2 100%); color: white; border: none; border-radius: 6px; font-size: 14px; cursor: pointer;">测试阶段检测</button>
                <button id="save-config" style="padding: 10px 20px; background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%); color: white; border: none; border-radius: 6px; font-size: 14px; cursor: pointer;">保存配置</button>
                <button id="reset-config" style="padding: 10px 20px; background: linear-gradient(135deg, #FF9800 0%, #F57C00 100%); color: white; border: none; border-radius: 6px; font-size: 14px; cursor: pointer;">重置默认</button>
            </div>
        `;

        // 绑定配置面板事件
        setTimeout(() => {
            document.getElementById('close-config-panel').addEventListener('click', () => {
                configPanel.style.display = 'none';
            });

            document.getElementById('view-saved-accounts').addEventListener('click', () => {
                configPanel.style.display = 'none';
                showAllAccountsPanel();
            });
            document.getElementById('save-config').addEventListener('click', saveConfig);
            document.getElementById('reset-config').addEventListener('click', resetConfig);
            document.getElementById('test-stage-detection').addEventListener('click', testStageDetection);

        }, 100);

        return panel;
    }
    // 显示配置面板
    function showConfigPanel() {
        let configPanel = document.getElementById('qoder-config-panel');
        if (!configPanel) {
            configPanel = createConfigPanel();
            document.body.appendChild(configPanel);
        }
        configPanel.style.display = 'block';
    }

    // 显示所有账号面板
    function showAllAccountsPanel() {
        const accounts = configManager.getAccounts();

        // 移除已存在的面板
        const existingPanel = document.getElementById('qoder-all-accounts-panel');
        if (existingPanel) {
            existingPanel.remove();
        }

        const panel = document.createElement('div');
        panel.id = 'qoder-all-accounts-panel';
        panel.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.3);
            padding: 24px;
            z-index: 10003;
            max-width: 600px;
            width: 90%;
            max-height: 80vh;
            overflow-y: auto;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `;

        if (accounts.length === 0) {
            panel.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h3 style="margin: 0; color: #333; font-size: 18px;">📚 已保存的账号</h3>
                    <button id="close-all-accounts" style="background: none; border: none; font-size: 20px; cursor: pointer; color: #666;">×</button>
                </div>
                <div style="text-align: center; padding: 40px; color: #666;">
                    <div style="font-size: 48px; margin-bottom: 16px;">📭</div>
                    <div>暂无保存的账号</div>
                </div>
            `;
        } else {
            const accountsHtml = accounts.map(account => `
                <div style="background: #f8f9fa; border-radius: 8px; padding: 16px; margin-bottom: 12px; border-left: 4px solid #4CAF50;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                        <div style="font-weight: bold; color: #333;">${account.firstName} ${account.lastName}</div>
                        <div style="display: flex; gap: 4px;">
                            <button class="copy-account" data-id="${account.id}" style="background: none; border: none; color: #007bff; cursor: pointer; font-size: 12px;">📋</button>
                            <button class="delete-account" data-id="${account.id}" style="background: none; border: none; color: #dc3545; cursor: pointer; font-size: 12px;">🗑️</button>
                        </div>
                    </div>
                    <div style="font-size: 12px; color: #666; line-height: 1.4;">
                        <div><strong>邮箱:</strong> ${account.email}</div>
                        <div><strong>密码:</strong> <span class="password-display" style="font-family: monospace;">••••••••••••</span> <button class="toggle-password" data-id="${account.id}" style="background: none; border: none; color: #007bff; cursor: pointer; font-size: 11px;">显示</button></div>
                        <div><strong>域名:</strong> ${account.domain}</div>
                        <div><strong>注册时间:</strong> ${new Date(account.createdAt).toLocaleString()}</div>
                        <div><strong>状态:</strong> <span style="color: #4CAF50;">${account.status}</span></div>
                    </div>
                </div>
            `).join('');

            panel.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h3 style="margin: 0; color: #333; font-size: 18px;">📚 已保存的账号 (${accounts.length})</h3>
                    <button id="close-all-accounts" style="background: none; border: none; font-size: 20px; cursor: pointer; color: #666;">×</button>
                </div>
                <div style="margin-bottom: 16px;">
                    <button id="export-accounts" style="padding: 8px 16px; background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%); color: white; border: none; border-radius: 6px; font-size: 14px; cursor: pointer;">📤 导出所有账号</button>
                    <button id="clear-all-accounts" style="padding: 8px 16px; background: linear-gradient(135deg, #dc3545 0%, #c82333 100%); color: white; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; margin-left: 8px;">🗑️ 清空所有账号</button>
                </div>
                <div id="accounts-list">
                    ${accountsHtml}
                </div>
            `;
        }

        document.body.appendChild(panel);

        // 绑定事件
        setTimeout(() => {
            // 关闭面板
            document.getElementById('close-all-accounts').addEventListener('click', () => {
                panel.remove();
            });

            // 导出所有账号
            const exportBtn = document.getElementById('export-accounts');
            if (exportBtn) {
                exportBtn.addEventListener('click', () => {
                    const accountsText = accounts.map(account =>
                        `姓名: ${account.firstName} ${account.lastName}\n邮箱: ${account.email}\n密码: ${account.password}\n域名: ${account.domain}\n注册时间: ${new Date(account.createdAt).toLocaleString()}\n状态: ${account.status}\n${'-'.repeat(50)}`
                    ).join('\n\n');

                    const blob = new Blob([accountsText], { type: 'text/plain' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `qoder_accounts_${new Date().toISOString().split('T')[0]}.txt`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);

                    showToast('账号信息已导出', 'success');
                });
            }

            // 清空所有账号
            const clearBtn = document.getElementById('clear-all-accounts');
            if (clearBtn) {
                clearBtn.addEventListener('click', () => {
                    if (confirm('确定要清空所有保存的账号吗？此操作不可恢复！')) {
                        localStorage.removeItem(STORAGE_KEYS.accounts);
                        showToast('所有账号已清空', 'success');
                        panel.remove();
                    }
                });
            }

            // 复制单个账号
            document.querySelectorAll('.copy-account').forEach(btn => {
                btn.addEventListener('click', () => {
                    const accountId = btn.getAttribute('data-id');
                    const account = accounts.find(acc => acc.id === accountId);
                    if (account) {
                        const accountText = `姓名: ${account.firstName} ${account.lastName}\n邮箱: ${account.email}\n密码: ${account.password}\n域名: ${account.domain}\n注册时间: ${new Date(account.createdAt).toLocaleString()}`;

                        navigator.clipboard.writeText(accountText).then(() => {
                            showToast('账号信息已复制', 'success');
                        }).catch(() => {
                            const textArea = document.createElement('textarea');
                            textArea.value = accountText;
                            document.body.appendChild(textArea);
                            textArea.select();
                            document.execCommand('copy');
                            document.body.removeChild(textArea);
                            showToast('账号信息已复制', 'success');
                        });
                    }
                });
            });

            // 删除单个账号
            document.querySelectorAll('.delete-account').forEach(btn => {
                btn.addEventListener('click', () => {
                    const accountId = btn.getAttribute('data-id');
                    if (confirm('确定要删除这个账号吗？')) {
                        configManager.deleteAccount(accountId);
                        showToast('账号已删除', 'success');
                        panel.remove();
                        showAllAccountsPanel(); // 重新加载面板
                    }
                });
            });

            // 切换密码显示
            document.querySelectorAll('.toggle-password').forEach(btn => {
                btn.addEventListener('click', () => {
                    const accountId = btn.getAttribute('data-id');
                    const account = accounts.find(acc => acc.id === accountId);
                    const passwordDisplay = btn.previousElementSibling;

                    if (passwordDisplay.textContent === '••••••••••••') {
                        passwordDisplay.textContent = account.password;
                        btn.textContent = '隐藏';
                    } else {
                        passwordDisplay.textContent = '••••••••••••';
                        btn.textContent = '显示';
                    }
                });
            });
        }, 100);
    }

    // 显示账号信息面板
    function showAccountInfoPanel(accountInfo) {
        // 移除已存在的面板
        const existingPanel = document.getElementById('qoder-account-info-panel');
        if (existingPanel) {
            existingPanel.remove();
        }

        const panel = document.createElement('div');
        panel.id = 'qoder-account-info-panel';
        panel.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.3);
            padding: 24px;
            z-index: 10003;
            max-width: 400px;
            width: 90%;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `;

        panel.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h3 style="margin: 0; color: #333; font-size: 18px;">🎉 注册成功！</h3>
                <button id="close-account-info" style="background: none; border: none; font-size: 20px; cursor: pointer; color: #666;">×</button>
            </div>

            <div style="background: #f8f9fa; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
                <h4 style="margin: 0 0 12px 0; color: #333; font-size: 14px;">📋 账号信息</h4>
                <div style="font-size: 13px; line-height: 1.5; color: #666;">
                    <div><strong>姓名:</strong> ${accountInfo.firstName} ${accountInfo.lastName}</div>
                    <div><strong>邮箱:</strong> ${accountInfo.email}</div>
                    <div><strong>密码:</strong> <span id="password-display" style="font-family: monospace;">••••••••••••</span> <button id="toggle-password" style="background: none; border: none; color: #007bff; cursor: pointer; font-size: 12px;">显示</button></div>
                    <div><strong>域名:</strong> ${accountInfo.domain}</div>
                    <div><strong>注册时间:</strong> ${new Date(accountInfo.registrationTime).toLocaleString()}</div>
                </div>
            </div>

            <div style="display: flex; gap: 8px;">
                <button id="copy-account-info" style="flex: 1; padding: 10px; background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%); color: white; border: none; border-radius: 6px; font-size: 14px; cursor: pointer;">📋 复制信息</button>
                <button id="view-all-accounts" style="flex: 1; padding: 10px; background: linear-gradient(135deg, #2196F3 0%, #1976D2 100%); color: white; border: none; border-radius: 6px; font-size: 14px; cursor: pointer;">📚 查看所有</button>
            </div>
        `;

        document.body.appendChild(panel);

        // 绑定事件
        setTimeout(() => {
            // 关闭面板
            document.getElementById('close-account-info').addEventListener('click', () => {
                panel.remove();
            });

            // 切换密码显示
            let passwordVisible = false;
            document.getElementById('toggle-password').addEventListener('click', () => {
                const passwordDisplay = document.getElementById('password-display');
                const toggleBtn = document.getElementById('toggle-password');

                if (passwordVisible) {
                    passwordDisplay.textContent = '••••••••••••';
                    toggleBtn.textContent = '显示';
                } else {
                    passwordDisplay.textContent = accountInfo.password;
                    toggleBtn.textContent = '隐藏';
                }
                passwordVisible = !passwordVisible;
            });

            // 复制账号信息
            document.getElementById('copy-account-info').addEventListener('click', () => {
                const accountText = `姓名: ${accountInfo.firstName} ${accountInfo.lastName}\n邮箱: ${accountInfo.email}\n密码: ${accountInfo.password}\n域名: ${accountInfo.domain}\n注册时间: ${new Date(accountInfo.registrationTime).toLocaleString()}`;

                navigator.clipboard.writeText(accountText).then(() => {
                    showToast('账号信息已复制到剪贴板', 'success');
                }).catch(() => {
                    // 降级方案
                    const textArea = document.createElement('textarea');
                    textArea.value = accountText;
                    document.body.appendChild(textArea);
                    textArea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textArea);
                    showToast('账号信息已复制到剪贴板', 'success');
                });
            });

            // 查看所有账号
            document.getElementById('view-all-accounts').addEventListener('click', () => {
                panel.remove();
                showAllAccountsPanel();
            });
        }, 100);
    }



    // 测试API
    async function testApi(config) {
        try {
            // 测试tempmail配置
            if (config.tempEmailConfig && config.tempEmailConfig.tempmail) {
                const tempmail = config.tempEmailConfig.tempmail;
                const epin = config.tempEmailConfig.epin;

                if (!tempmail) {
                    Logger.error('❌ tempmail配置为空');
                    return false;
                }

                Logger.info(`🧪 测试配置 - 邮箱: ${tempmail}, epin: ${epin || '未设置'}`);

                // 使用TempEmailManager测试API调用
                const tempEmailManager = new TempEmailManager();
                try {
                    const data = await tempEmailManager.getMailList(tempmail, epin, 5);

                    // API错误响应已在makeApiRequest中统一处理
                    Logger.success('✅ tempmail配置验证通过');
                    return true;
                } catch (error) {
                    Logger.error(`❌ tempmail API调用失败: ${error.message}`);
                    return false;
                }
            }

            return true;
        } catch (error) {
            Logger.error(`❌ 配置测试失败: ${error.message}`);
            return false;
        }
    }

    // 保存配置
    async function saveConfig() {
        const customDomains = document.getElementById('custom-domains').value.split('\n').filter(domain => domain.trim());
        const autoFetch = document.getElementById('auto-fetch').checked;

        // 临时邮箱服务配置
        const tempmail = document.getElementById('tempmail').value.trim();
        const epin = document.getElementById('epin').value.trim();

        const newConfig = {
            customDomains: customDomains,
            autoFetchVerificationCode: autoFetch,
            tempEmailConfig: {
                tempmail: tempmail,
                epin: epin,
                first_id: ''
            }
        };

                // 测试配置
        Logger.info('🧪 正在测试配置...');
        const testResult = await testApi(newConfig);

        if (testResult) {
            configManager.updateConfig(newConfig);
            Logger.success('✅ 配置验证通过，已保存');
            showToast('配置验证通过，已保存', 'success');
        } else {
            Logger.error('❌ 配置验证失败，请检查配置');
            showToast('配置验证失败，请检查配置', 'error');
            return;
        }

        // 隐藏配置面板
        document.getElementById('qoder-config-panel').style.display = 'none';
    }

    // 重置配置
    function resetConfig() {
        const defaultConfig = configManager.getDefaultConfig();
        configManager.updateConfig(defaultConfig);

        // 重新加载配置面板
        const configPanel = document.getElementById('qoder-config-panel');
        if (configPanel) {
            configPanel.remove();
        }
        showConfigPanel();

        Logger.info('🔄 配置已重置为默认值');
        showToast('配置已重置为默认值', 'info');
    }

    // 测试阶段检测
    function testStageDetection() {
        Logger.info('🧪 开始测试页面阶段检测...');

        // 检测各个阶段的元素
        const firstNameInput = document.querySelector('input[id="basic_firstName"]');
        const lastNameInput = document.querySelector('input[id="basic_lastName"]');
        const emailInput = document.querySelector('input[id="basic_email"]');
        const passwordInput = document.querySelector('input[id="basic_password"]');
        const captchaCheckbox = document.querySelector('#aliyunCaptcha-checkbox-icon');
        const otpInputs = document.querySelectorAll('.ant-otp-input');
        const verificationCodeContainer = document.querySelector('.verificationCode--o_u9MiU');

        Logger.info('📊 页面元素检测结果:');
        Logger.info(`   姓名输入框: ${firstNameInput ? '✅ 存在' : '❌ 不存在'}`);
        Logger.info(`   姓氏输入框: ${lastNameInput ? '✅ 存在' : '❌ 不存在'}`);
        Logger.info(`   邮箱输入框: ${emailInput ? '✅ 存在' : '❌ 不存在'}`);
        Logger.info(`   密码输入框: ${passwordInput ? '✅ 存在' : '❌ 不存在'}`);

        // 详细检测每个输入框的状态
        if (firstNameInput) {
            const firstNameFormItem = firstNameInput.closest('.ant-form-item');
            const isFirstNameHidden = firstNameFormItem && firstNameFormItem.classList.contains('ant-form-item-hidden');
            Logger.info(`   姓名输入框状态: ${isFirstNameHidden ? '🔒 隐藏' : '👁️ 可见'}`);
        }

        if (lastNameInput) {
            const lastNameFormItem = lastNameInput.closest('.ant-form-item');
            const isLastNameHidden = lastNameFormItem && lastNameFormItem.classList.contains('ant-form-item-hidden');
            Logger.info(`   姓氏输入框状态: ${isLastNameHidden ? '🔒 隐藏' : '👁️ 可见'}`);
        }

        if (emailInput) {
            const emailFormItem = emailInput.closest('.ant-form-item');
            const isEmailHidden = emailFormItem && emailFormItem.classList.contains('ant-form-item-hidden');
            Logger.info(`   邮箱输入框状态: ${isEmailHidden ? '🔒 隐藏' : '👁️ 可见'}`);
        }

        if (passwordInput) {
            const passwordFormItem = passwordInput.closest('.ant-form-item');
            const isPasswordHidden = passwordFormItem && passwordFormItem.classList.contains('ant-form-item-hidden');
            Logger.info(`   密码输入框状态: ${isPasswordHidden ? '🔒 隐藏' : '👁️ 可见'}`);
        }

        Logger.info(`   验证码复选框: ${captchaCheckbox ? '✅ 存在' : '❌ 不存在'}`);
        Logger.info(`   验证码输入框: ${otpInputs.length > 0 ? `✅ 存在 ${otpInputs.length} 个` : '❌ 不存在'}`);
        Logger.info(`   验证码容器: ${verificationCodeContainer ? '✅ 存在' : '❌ 不存在'}`);

        // 检测人机验证相关文本
        const titleElement = document.querySelector('h5.title--ld_VROk');
        if (titleElement) {
            Logger.info(`   页面标题: "${titleElement.textContent}"`);
        }

        // 检测第四阶段相关文本
        const otpTitleElement = document.querySelector('h5.title--JYxHTYG');
        if (otpTitleElement) {
            Logger.info(`   邮箱验证标题: "${otpTitleElement.textContent}"`);
        }

        // 检测各个阶段的判断结果
        Logger.info('🔍 各阶段检测结果:');
        Logger.info(`   第一阶段检测: ${isFirstStage() ? '✅ 是' : '❌ 否'}`);
        Logger.info(`   第二阶段检测: ${isSecondStage() ? '✅ 是' : '❌ 否'}`);
        Logger.info(`   第三阶段检测: ${isCaptchaStage() ? '✅ 是' : '❌ 否'}`);
        Logger.info(`   第四阶段检测: ${isOtpStage() ? '✅ 是' : '❌ 否'}`);
        Logger.info(`   成功页面检测: ${isSuccessStage() ? '✅ 是' : '❌ 否'}`);

        // 使用阶段检测函数
        const currentStage = detectCurrentStage();
        Logger.info(`🎯 最终检测到的阶段: ${currentStage}`);

        // 显示检测结果
        showToast(`阶段检测结果: ${currentStage}`, 'info');
    }

    // 更新当前阶段显示
    function updateCurrentStage() {
        const stageInfo = document.getElementById('stage-info');
        if (!stageInfo) return;

        // 通过网页元素判断当前阶段
        const currentStage = detectCurrentStage();

        let stageText = '';
        let stageColor = '#666';

        switch (currentStage) {
            case 'first':
                stageText = '第一阶段：姓名和邮箱填写';
                stageColor = '#2196F3';
                break;
            case 'second':
                stageText = '第二阶段：密码设置';
                stageColor = '#FF9800';
                break;
            case 'captcha':
                stageText = '第三阶段：人机验证';
                stageColor = '#9C27B0';
                break;
            case 'otp':
                stageText = '第四阶段：邮箱验证码';
                stageColor = '#4CAF50';
                break;
            case 'success':
                stageText = '注册完成';
                stageColor = '#4CAF50';
                break;
            default:
                stageText = '未知阶段：等待页面加载';
                stageColor = '#666';
        }

        stageInfo.textContent = stageText;
        stageInfo.style.color = stageColor;
    }

    // 通过网页元素检测当前注册阶段
    function detectCurrentStage() {
        // 检测第一阶段：姓名和邮箱填写页面
        if (isFirstStage()) {
            return 'first';
        }

        // 检测第二阶段：密码设置页面
        if (isSecondStage()) {
            return 'second';
        }

        // 检测第三阶段：人机验证页面
        if (isCaptchaStage()) {
            return 'captcha';
        }

        // 检测第四阶段：邮箱验证码页面
        if (isOtpStage()) {
            return 'otp';
        }

        // 检测注册完成页面
        if (isSuccessStage()) {
            return 'success';
        }

        return 'unknown';
    }

    // 检测第一阶段：姓名和邮箱填写
    function isFirstStage() {
        // 检查是否存在第一阶段的特征元素
        const firstNameInput = document.querySelector('input[id="basic_firstName"]');
        const lastNameInput = document.querySelector('input[id="basic_lastName"]');
        const emailInput = document.querySelector('input[id="basic_email"]');
        const passwordInput = document.querySelector('input[id="basic_password"]');

        // 第一阶段特征：
        // 1. 存在姓名和邮箱输入框且都是可见的（没有ant-form-item-hidden类）
        // 2. 密码输入框不存在或隐藏
        if (firstNameInput && lastNameInput && emailInput) {
            const firstNameFormItem = firstNameInput.closest('.ant-form-item');
            const lastNameFormItem = lastNameInput.closest('.ant-form-item');
            const emailFormItem = emailInput.closest('.ant-form-item');

            const isFirstNameVisible = !firstNameFormItem || !firstNameFormItem.classList.contains('ant-form-item-hidden');
            const isLastNameVisible = !lastNameFormItem || !lastNameFormItem.classList.contains('ant-form-item-hidden');
            const isEmailVisible = !emailFormItem || !emailFormItem.classList.contains('ant-form-item-hidden');

            // 姓名和邮箱都可见，说明是第一阶段
            if (isFirstNameVisible && isLastNameVisible && isEmailVisible) {
                return true;
            }
        }

        return false;
    }

    // 检测第二阶段：密码设置
    function isSecondStage() {
        // 检查是否存在第二阶段的特征元素
        const passwordInput = document.querySelector('input[id="basic_password"]');
        const firstNameInput = document.querySelector('input[id="basic_firstName"]');
        const lastNameInput = document.querySelector('input[id="basic_lastName"]');
        const emailInput = document.querySelector('input[id="basic_email"]');

        // 第二阶段特征：
        // 1. 存在密码输入框且不是隐藏的
        // 2. 姓名和邮箱输入框都存在但被隐藏（添加了ant-form-item-hidden类）
        if (passwordInput && firstNameInput && lastNameInput && emailInput) {
            const passwordFormItem = passwordInput.closest('.ant-form-item');
            const firstNameFormItem = firstNameInput.closest('.ant-form-item');
            const lastNameFormItem = lastNameInput.closest('.ant-form-item');
            const emailFormItem = emailInput.closest('.ant-form-item');

            const isPasswordVisible = !passwordFormItem || !passwordFormItem.classList.contains('ant-form-item-hidden');
            const isFirstNameHidden = firstNameFormItem && firstNameFormItem.classList.contains('ant-form-item-hidden');
            const isLastNameHidden = lastNameFormItem && lastNameFormItem.classList.contains('ant-form-item-hidden');
            const isEmailHidden = emailFormItem && emailFormItem.classList.contains('ant-form-item-hidden');

            // 密码可见且姓名邮箱都被隐藏，说明是第二阶段
            if (isPasswordVisible && isFirstNameHidden && isLastNameHidden && isEmailHidden) {
                return true;
            }
        }

        return false;
    }

    // 检测第三阶段：人机验证
    function isCaptchaStage() {
        // 检查是否存在人机验证的特征元素
        const captchaCheckbox = document.querySelector('#aliyunCaptcha-checkbox-icon');
        const captchaBody = document.querySelector('#aliyunCaptcha-checkbox-body');
        const captchaText = document.querySelector('#aliyunCaptcha-checkbox-text');
        const captchaElement = document.querySelector('#captcha-element');
        const captchaButton = document.querySelector('#captcha-button');

        // 检查页面标题是否包含人机验证相关文本
        const titleElement = document.querySelector('h5.title--ld_VROk');
        const titleText = titleElement ? titleElement.textContent : '';

        // 第三阶段特征：
        // 1. 存在阿里云验证码相关元素
        // 2. 页面标题包含人机验证相关文本
        if (captchaCheckbox || captchaBody || captchaText || captchaElement || captchaButton) {
            return true;
        }

        // 检查标题文本
        if (titleText.toLowerCase().includes('human') ||
            titleText.toLowerCase().includes('robot') ||
            titleText.toLowerCase().includes('captcha')) {
            return true;
        }

        // 检查验证码文本内容
        if (captchaText && captchaText.textContent) {
            const text = captchaText.textContent.toLowerCase();
            if (text.includes('robot') || text.includes('human') || text.includes('captcha')) {
                return true;
            }
        }

        return false;
    }

    // 检测第四阶段：邮箱验证码
    function isOtpStage() {
        // 检查是否存在验证码输入框
        const otpInputs = document.querySelectorAll('.ant-otp-input');
        const verificationCodeContainer = document.querySelector('.verificationCode--o_u9MiU');
        const otpWrapper = document.querySelector('.ant-otp');

        // 检查页面标题是否包含验证码相关文本
        const titleElement = document.querySelector('h5.title--JYxHTYG');
        const titleText = titleElement ? titleElement.textContent : '';

        // 第四阶段特征：
        // 1. 存在验证码输入框（通常是6个）
        // 2. 存在验证码容器
        // 3. 页面标题包含"Verify your email"或"Enter the code"
        if (otpInputs.length > 0 || verificationCodeContainer || otpWrapper) {
            return true;
        }

        // 检查标题文本
        if (titleText.toLowerCase().includes('verify your email') ||
            titleText.toLowerCase().includes('enter the code') ||
            titleText.toLowerCase().includes('verification')) {
            return true;
        }

        return false;
    }

    // 检测注册完成页面
    function isSuccessStage() {
        // 检查是否存在注册成功的特征元素
        const successMessage = document.querySelector('h3.title--IVM9xGl');
        const successText = successMessage ? successMessage.textContent : '';

        // 检查URL是否包含成功标识
        const currentUrl = window.location.href;

        // 成功页面特征：标题包含"Welcome"或URL包含成功标识
        if (successText.toLowerCase().includes('welcome') ||
            successText.toLowerCase().includes('success') ||
            currentUrl.includes('/account/profile') ||
            currentUrl.includes('/dashboard')) {

            // 注册成功时自动保存账号信息
            saveAccountOnSuccess();
            return true;
        }

        return false;
    }

    // 注册成功时保存账号信息
    function saveAccountOnSuccess() {
        try {
            // 检查是否已经保存过（避免重复保存）
            if (window.accountSaved) {
                return;
            }

            // 获取之前生成的用户信息
            const userInfo = window.lastGeneratedUserInfo;
            if (!userInfo) {
                Logger.warning('⚠️ 未找到用户信息，无法保存账号');
                return;
            }

            // 构建账号信息
            const accountInfo = {
                firstName: userInfo.firstName,
                lastName: userInfo.lastName,
                email: userInfo.email,
                password: userInfo.password,
                domain: userInfo.email.split('@')[1],
                registrationTime: new Date().toISOString()
            };

            // 保存账号信息
            const accountId = configManager.saveAccount(accountInfo);
            if (accountId) {
                window.accountSaved = true;
                Logger.success(`🎉 注册成功！账号已保存，ID: ${accountId}`);
                showToast('注册成功！账号信息已保存', 'success');

                // 显示账号信息面板
                showAccountInfoPanel(accountInfo);
            }
        } catch (error) {
            Logger.error(`❌ 保存账号信息失败: ${error.message}`);
        }
    }

    // 开始注册流程 - 配置版
    async function startRegistration() {
        Logger.info('🚀 开始注册流程（配置版）');
        updateButtonState(true); // 设置按钮为运行状态

        try {
            // 验证配置
            const config = configManager.config;

            // 检查自定义域名配置
            if (!config.customDomains || config.customDomains.length === 0) {
                Logger.error('❌ 未配置自定义域名，请先在配置面板中设置域名');
                showToast('请先在配置面板中设置自定义域名', 'error');
                updateButtonState(false);
                return;
            }

            // 检查tempmail配置
            if (!config.tempEmailConfig || !config.tempEmailConfig.tempmail) {
                Logger.error('❌ 未配置tempmail.plus服务，请先在配置面板中设置');
                showToast('请先在配置面板中设置tempmail.plus服务', 'error');
                updateButtonState(false);
                return;
            }

            // 检查epin配置（可为空，但如果有值需要验证格式）
            if (config.tempEmailConfig.epin && config.tempEmailConfig.epin.trim() === '') {
                Logger.warning('⚠️ epin配置为空字符串，如果临时邮箱服务需要epin，请配置正确的值');
            } else if (config.tempEmailConfig.epin) {
                Logger.info(`🔑 epin已配置: ${config.tempEmailConfig.epin}`);
            } else {
                Logger.info('ℹ️ epin未配置（可选）');
            }

            Logger.success('✅ 配置验证通过');

            // 生成用户信息（异步）
            const userInfo = {
                firstName: generateFirstName(),
                lastName: generateLastName(),
                email: await generateEmail(), // 异步生成邮箱
                password: passwordGenerator.generate(12)
            };

            // 保存用户信息到全局变量，供注册成功后保存账号使用
            window.lastGeneratedUserInfo = userInfo;

            // 保存生成的邮箱到临时邮箱管理器（用于后续获取验证码）
            tempEmailManager.currentEmail = userInfo.email;
            // 保存到全局变量，供后续验证码监控使用
            window.lastGeneratedEmail = userInfo.email;

            Logger.info(`📝 生成注册数据: ${userInfo.firstName} ${userInfo.lastName} | ${userInfo.email}`);

            // 使用新的阶段检测函数
            const currentStage = detectCurrentStage();
            Logger.info(`🔍 检测到当前阶段: ${currentStage}`);

            if (currentStage === 'first') {
                // 第一阶段：填写姓名和邮箱，然后点击Continue
                Logger.info('📋 第一阶段：填写姓名和邮箱');
                fillFirstStageForm(userInfo);

                // 等待填写完成后点击Continue
                setTimeout(() => {
                    const continueBtn = document.querySelector(SELECTORS.continueBtn);
                    if (continueBtn) {
                        Logger.info('🔄 点击Continue按钮进入密码设置');
                        continueBtn.click();

                        // 等待页面跳转后自动填写密码
                        setTimeout(() => {
                            Logger.info('⏳ 等待页面跳转完成，开始填写密码');
                            fillSecondStageForm(userInfo);
                        }, 4000); // 增加页面跳转等待时间
                    } else {
                        Logger.error('❌ 未找到Continue按钮');
                        updateButtonState(false);
                    }
                }, 3000); // 增加点击Continue前的等待时间
            } else if (currentStage === 'second') {
                // 第二阶段：填写密码，然后点击Continue
                Logger.info('🔐 第二阶段：填写密码');
                fillSecondStageForm(userInfo);

                // 等待填写完成后点击Continue
                setTimeout(async () => {
                    const continueBtn = document.querySelector(SELECTORS.continueBtn);
                    if (continueBtn) {
                        Logger.info('🔄 点击Continue按钮进入人机验证');
                        continueBtn.click();
                        showToast('已跳转到人机验证页面', 'success');

                        // 初始化邮件列表，保存first_id
                        setTimeout(async () => {
                            const tempEmailConfig = configManager.getTempEmailConfig();
                            const tempmail = tempEmailConfig.tempmail;
                            const epin = tempEmailConfig.epin;
                            if (tempmail) {
                                tempEmailManager.currentEmail = tempmail;
                                Logger.info(`📧 使用临时邮箱: ${tempmail}`);
                                if (epin) {
                                    Logger.info(`🔑 使用epin: ${epin}`);
                                }

                                try {
                                    const mailListData = await tempEmailManager.getMailList(tempmail, epin, 20);

                                    if (mailListData.result && mailListData.first_id !== undefined && mailListData.first_id !== null) {
                                        tempEmailManager.lastFirstId = mailListData.first_id;
                                        Logger.info(`📧 邮件列表初始化完成，first_id: ${mailListData.first_id}`);
                                    }
                                } catch (error) {
                                    Logger.warning(`⚠️ 邮件列表初始化失败: ${error.message}`);
                                }
                            }
                        }, 2000);
                    } else {
                        Logger.error('❌ 未找到Continue按钮');
                        updateButtonState(false);
                    }
                }, 3000); // 增加点击Continue前的等待时间
            } else if (currentStage === 'captcha') {
                // 第三阶段：开始人机验证
                Logger.info('🤖 第三阶段：开始人机验证');

                // 检查邮件列表是否已初始化（第二阶段应该已经完成）
                if (tempEmailManager.lastFirstId !== undefined && tempEmailManager.lastFirstId !== null) {
                    Logger.info(`📧 邮件列表已初始化，first_id: ${tempEmailManager.lastFirstId}`);
                } else {
                    Logger.warning('⚠️ 邮件列表未初始化，尝试重新初始化');
                    // 如果第二阶段没有成功初始化，在这里重新初始化
                    const tempEmailConfig = configManager.getTempEmailConfig();
                    const tempmail = tempEmailConfig.tempmail;
                    const epin = tempEmailConfig.epin;

                    if (tempmail) {
                        tempEmailManager.currentEmail = tempmail;
                        Logger.info(`📧 使用临时邮箱: ${tempmail}`);
                        if (epin) {
                            Logger.info(`🔑 使用epin: ${epin}`);
                        }

                        try {
                            const mailListData = await tempEmailManager.getMailList(tempmail, epin, 20);
                            if (mailListData.result && mailListData.first_id !== undefined && mailListData.first_id !== null) {
                                tempEmailManager.lastFirstId = mailListData.first_id;
                                Logger.info(`📧 邮件列表初始化完成，first_id: ${mailListData.first_id}`);
                            }
                        } catch (error) {
                            Logger.warning(`⚠️ 邮件列表初始化失败: ${error.message}`);
                        }
                    }
                }

                // 开始人机验证
                simulateHumanVerification();
            } else if (currentStage === 'otp') {
                // 第四阶段：邮箱验证码
                Logger.info('📧 第四阶段：邮箱验证码页面');

                // 创建验证码获取按钮
                createVerificationCodeButton();

                // 检查是否启用自动获取验证码
                if (configManager.isAutoFetchEnabled()) {
                    Logger.info('🤖 启用自动验证码获取模式');
                    await handleOtpStageWithAutoFetch();
                } else {
                    showToast('当前是邮箱验证码阶段，请点击"获取验证码"按钮或手动输入验证码', 'info');
                    handleOtpStage();
                }
                updateButtonState(false);
            } else if (currentStage === 'success') {
                Logger.success('🎉 注册已完成！');
                showToast('注册已完成！', 'success');
                updateButtonState(false);
            } else {
                Logger.warning('⏳ 未检测到表单字段，等待页面加载');
                showToast('正在等待页面加载...', 'info');
                updateButtonState(false);
            }
        } catch (error) {
            Logger.error(`❌ 注册流程出错: ${error.message}`);
            showToast('注册流程出错，请重试', 'error');
            updateButtonState(false);
        }
    }

    // 填写第一阶段表单
    function fillFirstStageForm(userInfo) {
        const firstNameInput = document.querySelector(SELECTORS.firstName);
        const lastNameInput = document.querySelector(SELECTORS.lastName);
        const emailInput = document.querySelector(SELECTORS.email);

        if (!firstNameInput || !lastNameInput || !emailInput) {
            Logger.error('❌ 未找到第一阶段表单字段');
            showToast('未找到第一阶段表单字段', 'error');
            updateButtonState(false);
            return;
        }

        Logger.info('📝 开始填写第一阶段表单');

        // 依次设置每个字段，增加间隔时间
        setInputValue(firstNameInput, userInfo.firstName);
        Logger.success(`✅ 填写姓名: ${userInfo.firstName}`);

        setTimeout(() => {
            setInputValue(lastNameInput, userInfo.lastName);
            Logger.success(`✅ 填写姓氏: ${userInfo.lastName}`);
        }, 800);

        setTimeout(() => {
            setInputValue(emailInput, userInfo.email);
            Logger.success(`✅ 填写邮箱: ${userInfo.email}`);
        }, 1600);

        // 确保复选框已勾选
        setTimeout(() => {
            const checkbox = document.querySelector(SELECTORS.checkbox);
            if (checkbox && !checkbox.checked) {
                checkbox.click();
                Logger.success('✅ 自动勾选复选框');
            } else if (checkbox && checkbox.checked) {
                Logger.info('ℹ️ 复选框已经勾选');
            }

            Logger.success('🎉 第一阶段表单填写完成');
            showToast('第一阶段表单填写完成！请点击Continue进入密码设置', 'success');
        }, 2400);
    }

    // 填写第二阶段表单
    function fillSecondStageForm(userInfo) {
        const passwordInput = document.querySelector(SELECTORS.password);

        if (!passwordInput) {
            Logger.error('❌ 未找到密码输入字段');
            showToast('未找到密码输入字段', 'error');
            updateButtonState(false);
            return;
        }

        Logger.info('🔐 开始填写第二阶段表单');

        // 设置密码字段
        setInputValue(passwordInput, userInfo.password);
        Logger.success(`✅ 填写密码: ${userInfo.password}`);

        Logger.success('🎉 第二阶段表单填写完成');
        showToast('密码设置完成！', 'success');

        // 等待密码填写完成后自动点击Continue
        setTimeout(() => {
            const continueBtn = document.querySelector(SELECTORS.continueBtn);
            if (continueBtn) {
                Logger.info('🔄 密码填写完成，点击Continue按钮进入人机验证');
                continueBtn.click();
                showToast('已跳转到人机验证页面', 'success');

                // 等待页面跳转后自动开始人机验证
                setTimeout(() => {
                    Logger.info('⏳ 等待人机验证页面加载完成');
                    simulateHumanVerification();
                }, 4000); // 增加页面跳转等待时间
            } else {
                Logger.error('❌ 未找到Continue按钮');
                updateButtonState(false);
            }
        }, 3000); // 增加点击Continue前的等待时间
    }

    // 日志记录功能
    let logCount = 0;
    const maxLogs = CONFIG.ui.maxLogs; // 最大日志条数

    function addLog(message, type = 'info') {
        const logContainer = document.getElementById('log-container');
        const logCountElement = document.getElementById('log-count');

        if (!logContainer) return;

        const timestamp = new Date().toLocaleTimeString();
        const typeColors = {
            'info': '#00ff00',
            'success': '#00ff00',
            'warning': '#ffff00',
            'error': '#ff0000',
            'debug': '#888888'
        };

        const color = typeColors[type] || '#00ff00';
        const icon = {
            'info': 'ℹ️',
            'success': '✅',
            'warning': '⚠️',
            'error': '❌',
            'debug': '🔍'
        }[type] || 'ℹ️';

        const logEntry = document.createElement('div');
        logEntry.style.cssText = `
            color: ${color};
            margin-bottom: 4px;
            word-wrap: break-word;
        `;
        logEntry.innerHTML = `<span style="color: #888;">[${timestamp}]</span> ${icon} ${message}`;

        logContainer.appendChild(logEntry);
        logCount++;

        // 更新日志计数
        if (logCountElement) {
            logCountElement.textContent = `${logCount} 条记录`;
        }

        // 自动滚动到底部
        logContainer.scrollTop = logContainer.scrollHeight;

        // 限制日志条数
        if (logContainer.children.length > maxLogs) {
            logContainer.removeChild(logContainer.firstChild);
        }

        // 同时输出到控制台
        console.log(`[${timestamp}] ${message}`);
    }

    function clearLogs() {
        const logContainer = document.getElementById('log-container');
        const logCountElement = document.getElementById('log-count');

        if (logContainer) {
            logContainer.innerHTML = '<div style="color: #888;">日志已清空...</div>';
        }

        if (logCountElement) {
            logCountElement.textContent = '0 条记录';
        }

        logCount = 0;
        addLog('日志已清空', 'info');
    }

    // 按钮状态管理
    function updateButtonState(isRunning = false) {
        const startButton = document.getElementById('start-register');
        if (!startButton) return;

        if (isRunning) {
            startButton.textContent = '注册中...';
            startButton.style.background = 'linear-gradient(135deg, #FF9800 0%, #F57C00 100%)';
            startButton.disabled = true;
            startButton.style.cursor = 'not-allowed';
        } else {
            startButton.textContent = '开始注册';
            startButton.style.background = 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)';
            startButton.disabled = false;
            startButton.style.cursor = 'pointer';
        }
    }

    // 显示提示消息
    function showToast(message, type = 'info') {
        // 添加到日志
        addLog(message, type);

        const toast = document.createElement('div');
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : type === 'warning' ? '#FF9800' : '#2196F3'};
            color: white;
            padding: 12px 24px;
            border-radius: 6px;
            font-size: 14px;
            z-index: 10001;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            animation: slideIn 0.3s ease;
        `;

        // 添加动画样式
        if (!document.getElementById('qoder-toast-styles')) {
            const style = document.createElement('style');
            style.id = 'qoder-toast-styles';
            style.textContent = `
                @keyframes slideIn {
                    from { transform: translateX(-50%) translateY(-100%); opacity: 0; }
                    to { transform: translateX(-50%) translateY(0); opacity: 1; }
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(toast);

        // 3秒后自动移除
        setTimeout(() => {
            toast.style.animation = 'slideIn 0.3s ease reverse';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, 3000);
    }

    // 人机验证模拟函数（仅用于学习目的）
    function simulateHumanVerification() {
        Logger.info('🤖 开始模拟人机验证');

        // 检查是否有错误信息
        const errorMessage = document.querySelector(SELECTORS.errorAlert);
        if (errorMessage) {
            const errorText = errorMessage.textContent.trim();
            Logger.error(`❌ 检测到错误: ${errorText}`);

            // 特殊处理人机验证错误
            if (errorText.includes('Unable to verify the user is human')) {
                Logger.warning('🤖 检测到人机验证失败，需要手动完成验证');
                showToast('请手动完成人机验证后重试', 'warning');
                updateButtonState(false);
                return;
            }
        }

        // 查找验证码复选框元素
        const captchaCheckbox = document.querySelector(SELECTORS.captchaCheckbox);
        const checkedIcon = document.querySelector(SELECTORS.captchaCheckedIcon);

        if (!captchaCheckbox) {
            Logger.error('❌ 未找到验证码复选框元素');
            showToast('未找到验证码复选框元素', 'error');
            updateButtonState(false);
            return;
        }

        if (!checkedIcon) {
            Logger.error('❌ 未找到验证码图标元素');
            showToast('未找到验证码图标元素', 'error');
            updateButtonState(false);
            return;
        }

        Logger.success('✅ 找到验证码元素，开始验证');
        showToast('开始模拟人机验证...', 'info');

        // 检查是否已经验证过 - 验证成功的真实标志
        const checkboxBody = captchaCheckbox.closest(SELECTORS.captchaBody);
        const checkboxText = document.querySelector(SELECTORS.captchaText);

        // 检查验证成功的真实标志
        const hasVerifiedClass = checkboxBody && checkboxBody.classList.contains('verified');
        const hasVerifiedText = checkboxText && checkboxText.textContent === 'Verified';

        if (hasVerifiedClass && hasVerifiedText) {
            Logger.success('🎉 验证码已经通过验证');
            Logger.debug(`  - verified类: ${hasVerifiedClass}`);
            Logger.debug(`  - verified文本: ${hasVerifiedText}`);
            showToast('验证码已经通过验证！', 'success');
            updateButtonState(false);
            return;
        }

        // 1. 模拟鼠标移动到验证码区域
        simulateHumanMouseMovement(checkedIcon);

        // 2. 等待一段时间后模拟点击
        setTimeout(() => {
            simulateHumanClick(checkedIcon);
        }, 4000 + Math.random() * 2000); // 增加等待时间

        // 3. 监听验证结果 - 使用更频繁的检查
        let verificationTimeout;
        let checkInterval;
        let retryCount = 0;
        const maxRetries = CONFIG.captcha.maxRetries;

        // 创建频繁检查函数
        function checkVerificationStatus() {
            // 首先检查是否已经跳转到验证码页面
            const otpInputs = document.querySelectorAll(SELECTORS.otpInputs);
            if (otpInputs.length > 0) {
                Logger.success('🎉 检测到已跳转到验证码页面！');
                showToast('已跳转到验证码页面，开始处理验证码', 'success');

                // 清理所有定时器
                if (verificationTimeout) {
                    clearTimeout(verificationTimeout);
                }
                if (checkInterval) {
                    clearInterval(checkInterval);
                }
                observer.disconnect();

                // 开始处理验证码
                setTimeout(async () => {
                    Logger.info('📧 开始处理验证码页面');
                    try {
                        await handleOtpStageWithAutoFetch();
                    } catch (error) {
                        Logger.error(`❌ 处理验证码页面时出错: ${error.message}`);
                        showToast('处理验证码页面时出错，请手动输入验证码', 'error');
                    }
                }, 1000);

                return true;
            }

            // 检查人机验证状态
            const checkboxBody = captchaCheckbox.closest(SELECTORS.captchaBody);
            const checkboxText = document.querySelector(SELECTORS.captchaText);

            const hasVerifiedClass = checkboxBody && checkboxBody.classList.contains('verified');
            const hasVerifiedText = checkboxText && checkboxText.textContent === 'Verified';

            if (hasVerifiedClass && hasVerifiedText) {
                Logger.success('🎉 验证成功！检测到验证状态');
                Logger.debug(`  - verified类: ${hasVerifiedClass}`);
                Logger.debug(`  - verified文本: ${hasVerifiedText}`);
                showToast('人机验证成功！', 'success');
                updateButtonState(false);

                // 清理所有定时器
                if (verificationTimeout) {
                    clearTimeout(verificationTimeout);
                }
                if (checkInterval) {
                    clearInterval(checkInterval);
                }
                observer.disconnect();

                // 验证成功，立即启动邮箱监控
                Logger.success('🎉 人机验证成功！立即启动邮箱监控...');
                showToast('验证成功！正在启动验证码监控...', 'success');

                // 立即启动验证码监控
                setTimeout(async () => {
                    Logger.info('📧 开始监控邮箱获取验证码...');

                    // 获取注册邮箱（从页面或之前保存的信息）
                    const emailSpan = document.querySelector(SELECTORS.verificationCode + ' span');
                    let registeredEmail = null;
                    if (emailSpan) {
                        const emailText = emailSpan.textContent;
                        const emailMatch = emailText.match(/sent to ([^:]+):/);
                        if (emailMatch) {
                            registeredEmail = emailMatch[1].trim();
                            Logger.info(`📧 从页面提取到注册邮箱: ${registeredEmail}`);
                        }
                    }

                    // 如果没有从页面获取到，使用之前生成的邮箱
                    if (!registeredEmail && window.lastGeneratedEmail) {
                        registeredEmail = window.lastGeneratedEmail;
                        Logger.info(`📧 使用之前生成的注册邮箱: ${registeredEmail}`);
                    }

                    if (registeredEmail) {
                        try {
                            // 确保临时邮箱配置正确
                            const tempEmailConfig = configManager.getTempEmailConfig();
                            const tempmail = tempEmailConfig.tempmail;
                            const epin = tempEmailConfig.epin;

                            if (tempmail) {
                                tempEmailManager.currentEmail = tempmail;
                                Logger.info(`📧 验证码监控使用临时邮箱: ${tempmail}`);
                                if (epin) {
                                    Logger.info(`🔑 验证码监控使用epin: ${epin}`);
                                }
                            }

                            // 先测试邮箱连接
                            Logger.info('🧪 开始测试邮箱连接...');
                            const connectionTest = await tempEmailManager.testEmailConnection();
                            if (!connectionTest) {
                                Logger.error('❌ 邮箱连接测试失败，请检查配置');
                                showToast('邮箱连接失败，请检查配置', 'error');
                                return;
                            }

                            // 获取邮箱状态
                            const emailStatus = await tempEmailManager.getEmailStatus();
                            Logger.info(`📊 邮箱状态: ${emailStatus.connected ? '已连接' : '未连接'}, 邮件数量: ${emailStatus.mailCount}`);

                            // 获取验证码
                            Logger.info('🔍 开始获取验证码...');
                            const verificationCode = await tempEmailManager.getVerificationCode(60000, registeredEmail);
                            if (verificationCode) {
                                Logger.success(`✅ 获取到验证码: ${verificationCode}`);
                                showToast(`获取到验证码: ${verificationCode}`, 'success');

                                // 自动填充验证码
                                Logger.info('🔧 开始自动填充验证码...');
                                const fillResult = await autoFillVerificationCode(verificationCode);

                                if (fillResult) {
                                    // 自动点击Continue
                                    setTimeout(() => {
                                        const continueBtn = document.querySelector(SELECTORS.continueBtn);
                                        if (continueBtn) {
                                            Logger.info('🔄 自动点击Continue按钮');
                                            continueBtn.click();
                                            showToast('验证码已自动提交，正在完成注册...', 'success');
                                        } else {
                                            Logger.error('❌ 未找到Continue按钮');
                                            showToast('请手动点击Continue按钮', 'warning');
                                        }
                                    }, 2000);
                                } else {
                                    Logger.error('❌ 验证码填充失败，请手动输入验证码');
                                    showToast('验证码填充失败，请手动输入', 'error');
                                }
                            } else {
                                Logger.error('❌ 验证码获取失败或超时');
                                Logger.info('💡 建议检查：');
                                Logger.info('   1. 邮箱配置是否正确');
                                Logger.info('   2. 是否已发送验证码邮件');
                                Logger.info('   3. 网络连接是否正常');
                                showToast('验证码获取失败，请手动输入', 'error');
                            }
                        } catch (error) {
                            Logger.error(`❌ 验证码监控出错: ${error.message}`);
                            showToast('验证码监控出错，请手动输入', 'error');
                        }
                    } else {
                        Logger.error('❌ 无法获取注册邮箱，验证码监控无法启动');
                        showToast('无法获取注册邮箱，请手动输入验证码', 'error');
                    }
                }, 1000);

                return true;
            }
            return false;
        }

        // 启动频繁检查（每500ms检查一次）
        checkInterval = setInterval(() => {
            if (checkVerificationStatus()) {
                return; // 如果验证成功，停止检查
            }
        }, 500);

        // MutationObserver作为备用检测
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (checkVerificationStatus()) {
                    return; // 如果验证成功，停止检查
                }
            });
        });

        observer.observe(checkedIcon, {
            attributes: true,
            attributeFilter: ['style'],
            childList: true,
            subtree: true
        });

        // 设置超时检测
        verificationTimeout = setTimeout(() => {
            Logger.warning('⏰ 验证超时，检查验证状态');

            // 首先检查是否已经跳转到验证码页面
            const otpInputs = document.querySelectorAll(SELECTORS.otpInputs);
            if (otpInputs.length > 0) {
                Logger.success('🎉 超时检测中发现已跳转到验证码页面！');
                showToast('已跳转到验证码页面，开始处理验证码', 'success');

                // 清理所有定时器
                if (checkInterval) {
                    clearInterval(checkInterval);
                }
                observer.disconnect();

                // 开始处理验证码
                setTimeout(() => {
                    Logger.info('📧 开始处理验证码页面');
                    handleOtpStageWithAutoFetch();
                }, 1000);

                return;
            }

            if (checkVerificationStatus()) {
                return; // 如果验证成功，停止检查
            }

            // 验证失败，尝试重试
            if (retryCount < maxRetries) {
                retryCount++;
                Logger.warning(`⚠️ 验证可能失败，尝试重新点击... (第${retryCount}次重试)`);
                showToast(`验证可能失败，尝试重新点击... (第${retryCount}次重试)`, 'warning');

                // 重试逻辑 - 重新设置检测机制
                setTimeout(() => {
                    Logger.info('🔄 开始重试验证');

                    // 重新设置检测机制
                    if (checkInterval) {
                        clearInterval(checkInterval);
                    }

                    // 重新启动频繁检查
                    checkInterval = setInterval(() => {
                        if (checkVerificationStatus()) {
                            return; // 如果验证成功，停止检查
                        }
                    }, 500);

                    // 重新设置超时检测
                    verificationTimeout = setTimeout(() => {
                        Logger.warning('⏰ 重试验证超时，检查验证状态');

                        // 检查是否已经跳转到验证码页面
                        const otpInputs = document.querySelectorAll(SELECTORS.otpInputs);
                        if (otpInputs.length > 0) {
                            Logger.success('🎉 重试超时检测中发现已跳转到验证码页面！');
                            showToast('已跳转到验证码页面，开始处理验证码', 'success');

                            // 清理所有定时器
                            if (checkInterval) {
                                clearInterval(checkInterval);
                            }
                            observer.disconnect();

                            // 开始处理验证码
                            setTimeout(async () => {
                                Logger.info('📧 开始处理验证码页面');
                                try {
                                    await handleOtpStageWithAutoFetch();
                                } catch (error) {
                                    Logger.error(`❌ 处理验证码页面时出错: ${error.message}`);
                                    showToast('处理验证码页面时出错，请手动输入验证码', 'error');
                                }
                            }, 1000);

                            return;
                        }

                        if (checkVerificationStatus()) {
                            return; // 如果验证成功，停止检查
                        }

                        // 递归重试
                        retryCount++;
                        if (retryCount < maxRetries) {
                            Logger.warning(`⚠️ 重试验证可能失败，尝试再次重试... (第${retryCount}次重试)`);
                            showToast(`重试验证可能失败，尝试再次重试... (第${retryCount}次重试)`, 'warning');

                            // 递归调用重试逻辑
                            setTimeout(() => {
                                Logger.info('🔄 开始递归重试验证');
                                simulateHumanClick(checkedIcon);
                            }, 2000);
                        } else {
                            Logger.error('❌ 验证失败，已达到最大重试次数');
                            showToast('验证失败，已达到最大重试次数', 'error');
                            updateButtonState(false);

                            // 清理定时器
                            if (checkInterval) {
                                clearInterval(checkInterval);
                            }
                            observer.disconnect();
                        }
                    }, 8000); // 重试超时时间

                    // 执行重试点击
                    simulateHumanClick(checkedIcon);
                }, 2000);
            } else {
                Logger.error('❌ 验证失败，已达到最大重试次数');
                showToast('验证失败，已达到最大重试次数', 'error');
                updateButtonState(false);

                // 清理定时器
                if (checkInterval) {
                    clearInterval(checkInterval);
                }
                observer.disconnect();
            }
        }, 8000); // 减少到8秒超时
    }

    // 模拟人类鼠标移动
    function simulateHumanMouseMovement(targetElement) {
        Logger.info('模拟鼠标移动...');

        try {
            const startX = Math.random() * window.innerWidth;
            const startY = Math.random() * window.innerHeight;
            const targetRect = targetElement.getBoundingClientRect();
            const targetX = targetRect.left + targetRect.width / 2;
            const targetY = targetRect.top + targetRect.height / 2;

            // 生成贝塞尔曲线路径
            const controlPoints = generateBezierCurve(startX, startY, targetX, targetY);
            const pathPoints = generatePathPoints(controlPoints, 30); // 减少点数，避免过多事件

            // 模拟鼠标移动
            pathPoints.forEach((point, index) => {
                setTimeout(() => {
                    try {
                        const mouseEvent = new MouseEvent('mousemove', {
                            clientX: point.x,
                            clientY: point.y,
                            bubbles: true,
                            cancelable: true
                        });
                        document.dispatchEvent(mouseEvent);
                    } catch (e) {
                        Logger.error('鼠标移动事件失败:', e);
                    }
                }, index * (CONFIG.captcha.mouseMoveDelay + Math.random() * 10)); // 增加时间间隔
            });
        } catch (e) {
            Logger.error('鼠标移动模拟失败:', e);
        }
    }

    // 生成贝塞尔曲线控制点
    function generateBezierCurve(startX, startY, endX, endY) {
        const midX = (startX + endX) / 2 + (Math.random() - 0.5) * 100;
        const midY = (startY + endY) / 2 + (Math.random() - 0.5) * 100;

        return [
            { x: startX, y: startY },
            { x: midX, y: midY },
            { x: endX, y: endY }
        ];
    }

    // 生成路径点
    function generatePathPoints(controlPoints, numPoints) {
        const points = [];
        for (let i = 0; i <= numPoints; i++) {
            const t = i / numPoints;
            const point = getBezierPoint(controlPoints, t);
            points.push(point);
        }
        return points;
    }

    // 贝塞尔曲线计算
    function getBezierPoint(controlPoints, t) {
        const n = controlPoints.length - 1;
        let x = 0, y = 0;

        for (let i = 0; i <= n; i++) {
            const coefficient = binomialCoefficient(n, i) * Math.pow(1 - t, n - i) * Math.pow(t, i);
            x += coefficient * controlPoints[i].x;
            y += coefficient * controlPoints[i].y;
        }

        return { x, y };
    }

    // 二项式系数计算
    function binomialCoefficient(n, k) {
        if (k === 0 || k === n) return 1;
        if (k > n - k) k = n - k;

        let result = 1;
        for (let i = 0; i < k; i++) {
            result = result * (n - i) / (i + 1);
        }
        return result;
    }

    // 模拟人类点击行为
    function simulateHumanClick(targetElement) {
        Logger.info('模拟点击行为...');

        try {
            // 1. 悬停一段时间
            setTimeout(() => {
                try {
                    const hoverEvent = new MouseEvent('mouseenter', {
                        bubbles: true,
                        cancelable: true
                    });
                    targetElement.dispatchEvent(hoverEvent);

                    // 2. 模拟鼠标按下
                    setTimeout(() => {
                        try {
                            const mouseDownEvent = new MouseEvent('mousedown', {
                                bubbles: true,
                                cancelable: true,
                                button: 0,
                                buttons: 1
                            });
                            targetElement.dispatchEvent(mouseDownEvent);

                            // 3. 模拟鼠标释放
                            setTimeout(() => {
                                try {
                                    const mouseUpEvent = new MouseEvent('mouseup', {
                                        bubbles: true,
                                        cancelable: true,
                                        button: 0,
                                        buttons: 0
                                    });
                                    targetElement.dispatchEvent(mouseUpEvent);

                                    // 4. 模拟点击
                                    setTimeout(() => {
                                        try {
                                            const clickEvent = new MouseEvent('click', {
                                                bubbles: true,
                                                cancelable: true,
                                                button: 0,
                                                buttons: 0
                                            });
                                            targetElement.dispatchEvent(clickEvent);

                                            Logger.info('点击模拟完成');
                                        } catch (e) {
                                            Logger.error('点击事件失败:', e);
                                            // 备用方案：直接调用click方法
                                            try {
                                                targetElement.click();
                                                Logger.info('备用点击方法成功');
                                            } catch (e2) {
                                                Logger.error('备用点击方法也失败:', e2);
                                            }
                                        }
                                    }, 10 + Math.random() * 50);
                                } catch (e) {
                                    Logger.error('mouseup事件失败:', e);
                                }
                            }, 50 + Math.random() * 100); // 随机按下时间
                        } catch (e) {
                            Logger.error('mousedown事件失败:', e);
                        }
                    }, 100 + Math.random() * 200); // 随机悬停时间
                } catch (e) {
                    Logger.error('mouseenter事件失败:', e);
                }
            }, 500 + Math.random() * 1000); // 随机延迟
        } catch (e) {
            Logger.error('模拟点击整体失败:', e);
            // 最后的备用方案
            try {
                targetElement.click();
                Logger.info('最终备用点击方法成功');
            } catch (e2) {
                Logger.error('最终备用点击方法也失败:', e2);
            }
        }
    }



    // 自动验证码获取处理函数（简化版，主要用于手动触发）
    async function handleOtpStageWithAutoFetch() {
        Logger.info('🤖 开始自动验证码获取流程');

        // 设置验证码输入框的优化体验
        handleOtpStage();

        // 从页面提取注册邮箱地址（用于匹配邮件详情中的to字段）
        const emailSpan = document.querySelector(SELECTORS.verificationCode + ' span');
        let registeredEmail = null;
        if (emailSpan) {
            const emailText = emailSpan.textContent;
            const emailMatch = emailText.match(/sent to ([^:]+):/);
            if (emailMatch) {
                registeredEmail = emailMatch[1].trim();
                Logger.info(`📧 从页面提取到注册邮箱: ${registeredEmail}`);
            }
        }

        if (!registeredEmail) {
            Logger.error('❌ 无法从页面获取注册邮箱地址');
            showToast('无法获取注册邮箱地址，请手动输入验证码', 'error');
            return;
        }

        // 使用临时邮箱监控
        const tempEmailConfig = configManager.getTempEmailConfig();
        const tempmail = tempEmailConfig.tempmail;
        const epin = tempEmailConfig.epin;

        if (!tempmail) {
            Logger.error('❌ 未配置tempmail.plus服务');
            showToast('未配置tempmail.plus服务，请手动输入验证码', 'error');
            return;
        }

        tempEmailManager.currentEmail = tempmail;
        Logger.info(`📧 使用临时邮箱监控: ${tempmail}`);
        if (epin) {
            Logger.info(`🔑 使用epin: ${epin}`);
        }
        Logger.info(`📧 注册邮箱: ${registeredEmail}`);

        // 开始监控邮箱
        Logger.info('📧 开始监控邮箱获取验证码...');

        try {
            // 获取验证码
            const verificationCode = await tempEmailManager.getVerificationCode(30000, registeredEmail); // 30秒超时，传入注册邮箱

            if (verificationCode) {
                Logger.success(`✅ 自动获取到验证码: ${verificationCode}`);
                showToast(`自动获取验证码成功: ${verificationCode}`, 'success');

                // 自动填充验证码
                const fillResult = await autoFillVerificationCode(verificationCode);

                if (fillResult) {
                    // 自动点击Continue
                    setTimeout(() => {
                        const continueBtn = document.querySelector(SELECTORS.continueBtn);
                        if (continueBtn) {
                            Logger.info('🔄 自动点击Continue按钮');
                            continueBtn.click();
                            showToast('验证码已自动提交，正在完成注册...', 'success');
                        } else {
                            Logger.error('❌ 未找到Continue按钮');
                            showToast('请手动点击Continue按钮', 'warning');
                        }
                    }, 2000);
                } else {
                    Logger.error('❌ 验证码填充失败，请手动输入验证码');
                    showToast('验证码填充失败，请手动输入', 'error');
                }

            } else {
                Logger.error('❌ 自动获取验证码失败');
                showToast('自动获取验证码失败，请手动输入', 'error');

            }
        } catch (error) {
            Logger.error(`❌ 自动验证码获取出错: ${error.message}`);
            showToast('自动验证码获取出错，请手动输入', 'error');
        }
    }

    // 自动填充验证码
    async function autoFillVerificationCode(code) {
        try {
            Logger.info(`🔧 开始自动填充验证码: ${code}`);
            const result = await OtpManager.fillCode(code);
            if (result) {
                Logger.success('✅ 验证码自动填充成功');
                showToast('验证码已自动填充', 'success');
            } else {
                Logger.error('❌ 验证码自动填充失败');
                showToast('验证码自动填充失败，请手动输入', 'error');
            }
            return result;
        } catch (error) {
            Logger.error(`❌ 验证码填充出错: ${error.message}`);
            showToast('验证码填充出错，请手动输入', 'error');
            return false;
        }
    }

    // 验证码填充优化处理函数
    function handleOtpStage() {
        Logger.info('🔧 开始优化验证码填充体验');
        return OtpManager.setupInputListeners();
    }

    // ==================== 验证码管理器 ====================
    const OtpManager = {
        // 验证码相关配置
        config: {
            errorText: 'expired or incorrect',
            focusDelay: 500,
            checkDelay: 1000,
            errorCheckDelay: 2000,
            inputDelay: 100,      // 输入框切换延迟
            pasteDelay: 50        // 粘贴处理延迟
        },

        // 调试验证码输入框
        debugOtpInputs() {
            Logger.info('🔍 开始调试验证码输入框...');

            // 检查验证码容器
            const container = document.querySelector('.verificationCode--o_u9MiU');
            if (container) {
                Logger.info('✅ 找到验证码容器');

                // 查找所有可能的输入框
                const allInputs = container.querySelectorAll('input');
                Logger.info(`📝 容器内找到 ${allInputs.length} 个输入框`);

                allInputs.forEach((input, index) => {
                    Logger.info(`   输入框 ${index + 1}: ${input.outerHTML.substring(0, 100)}...`);
                });
            } else {
                Logger.warning('❌ 未找到验证码容器');
            }

            // 检查所有OTP相关的输入框
            const otpSelectors = [
                '.ant-otp-input',
                'input[aria-label^="OTP Input"]',
                '.ant-otp .ant-input',
                'input[size="1"]'
            ];

            otpSelectors.forEach(selector => {
                const inputs = document.querySelectorAll(selector);
                Logger.info(`${selector}: 找到 ${inputs.length} 个输入框`);
            });
        },

        // 获取所有验证码输入框
        getOtpInputs() {
            // 调试信息
            this.debugOtpInputs();

            // 首先尝试主要选择器
            let inputs = document.querySelectorAll(SELECTORS.otpInputs);

            if (inputs.length === 0) {
                Logger.debug('🔍 主要选择器未找到输入框，尝试其他选择器');

                // 尝试其他可能的验证码输入框选择器
                const selectors = [
                    'input[aria-label^="OTP Input"]',
                    '.ant-otp .ant-input',
                    '.verificationCode--o_u9MiU input',
                    'input[size="1"]',
                    'input[type="text"]',
                    'input[type="number"]',
                    'input[autocomplete="one-time-code"]',
                    'input[placeholder*="code"]',
                    'input[placeholder*="验证"]',
                    'input[placeholder*="Code"]',
                    'input[placeholder*="OTP"]',
                    'input[placeholder*="PIN"]',
                    '.otp-input',
                    '.verification-input',
                    '.code-input'
                ];

                for (const selector of selectors) {
                    inputs = document.querySelectorAll(selector);
                    if (inputs.length > 0) {
                        Logger.debug(`🔍 使用选择器 "${selector}" 找到 ${inputs.length} 个输入框`);
                        break;
                    }
                }
            }

            return inputs;
        },

        // 获取验证码容器
        getOtpContainer() {
            return document.querySelector(SELECTORS.verificationCode);
        },

        // 获取错误提示元素
        getErrorAlert() {
            return document.querySelector(SELECTORS.errorAlert);
        },

        // 清空所有验证码输入框
        clearInputs() {
            const inputs = this.getOtpInputs();
            inputs.forEach(input => {
            input.value = '';
                input.dispatchEvent(new Event('input', { bubbles: true }));
            });
        },

        // 聚焦到第一个输入框
        focusFirstInput() {
            const inputs = this.getOtpInputs();
            if (inputs[0]) {
                inputs[0].focus();
                return true;
            }
            return false;
        },

        // 获取当前验证码
        getCurrentCode() {
            const inputs = this.getOtpInputs();
            return Array.from(inputs).map(input => input.value).join('');
        },

        // 检查验证码是否完整
        isCodeComplete() {
            const inputs = this.getOtpInputs();
            const code = this.getCurrentCode();
            return code.length === inputs.length;
        },

        // 检查是否有错误
        hasError() {
            const errorAlert = this.getErrorAlert();
            return errorAlert && errorAlert.textContent.includes(this.config.errorText);
        },



        // 处理验证码错误
        handleError() {
            if (this.hasError()) {
                Logger.error('❌ 验证码错误或已过期');
                showToast('验证码错误或已过期，请重新输入', 'error');

                this.clearInputs();

                setTimeout(() => {
                    if (this.focusFirstInput()) {
                        Logger.info('🔄 已清空验证码输入框，请重新输入');
                    }
                }, this.config.focusDelay);

        return true;
    }
            return false;
        },

        // 自动点击Continue按钮
        clickContinue() {
            const continueBtn = document.querySelector(SELECTORS.continueBtn);
            if (continueBtn) {
                Logger.info('🔄 自动点击Continue按钮');
                continueBtn.click();
                return true;
            } else {
                Logger.error('❌ 未找到Continue按钮');
                showToast('请手动点击Continue按钮', 'warning');
                return false;
            }
        },

        // 设置错误监听器
        setupErrorListener() {
            const otpContainer = this.getOtpContainer();
            if (!otpContainer) {
                Logger.warning('未找到验证码容器，无法设置错误监听器');
                return;
            }

            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.type === 'childList') {
                        mutation.addedNodes.forEach((node) => {
                            if (node.nodeType === Node.ELEMENT_NODE) {
                                const errorAlert = node.querySelector(SELECTORS.errorAlert);
                                if (errorAlert && errorAlert.textContent.includes(this.config.errorText)) {
                                    Logger.error('❌ 检测到验证码错误提示');
                                    showToast('验证码错误或已过期，请重新输入', 'error');
                                    this.handleError();
                                }
                            }
                        });
                    }
                });
            });

            observer.observe(otpContainer, {
                childList: true,
                subtree: true
            });

            Logger.info('👂 已设置验证码错误监听器');
            return observer;
        },

        // 设置输入框事件监听
        setupInputListeners() {
            const inputs = this.getOtpInputs();
            if (inputs.length === 0) {
                Logger.error('❌ 未找到验证码输入框');
            return;
        }

            Logger.success(`✅ 找到 ${inputs.length} 个验证码输入框`);

        // 自动聚焦到第一个输入框
        setTimeout(() => {
                this.focusFirstInput();
                Logger.success('🎯 自动聚焦到第一个验证码输入框');
            }, this.config.focusDelay);

        // 为每个输入框添加事件监听
            inputs.forEach((input, index) => {
                // 输入事件监听
            input.addEventListener('input', (e) => {
                const value = e.target.value;

                // 只允许数字输入
                if (!/^\d*$/.test(value)) {
                    e.target.value = value.replace(/\D/g, '');
                    return;
                }

                // 限制每个输入框只能输入一个数字
                if (value.length > 1) {
                    e.target.value = value.slice(0, 1);
                }

                // 如果输入了数字，自动跳转到下一个输入框
                    if (value.length === 1 && index < inputs.length - 1) {
                    setTimeout(() => {
                            inputs[index + 1].focus();
                        }, this.config.inputDelay);
                }

                // 检查是否所有输入框都已填写
                    this.checkCompletion();
            });

            // 退格键处理
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Backspace' && e.target.value === '' && index > 0) {
                    setTimeout(() => {
                            inputs[index - 1].focus();
                        }, this.config.inputDelay);
                }
            });

            // 粘贴事件处理
            input.addEventListener('paste', (e) => {
                e.preventDefault();
                const pastedData = e.clipboardData.getData('text');
                    const numbers = pastedData.replace(/\D/g, '').slice(0, inputs.length);

                if (numbers.length > 0) {
                    // 填充所有输入框
                    numbers.split('').forEach((num, i) => {
                            if (inputs[i]) {
                                inputs[i].value = num;
                                inputs[i].dispatchEvent(new Event('input', { bubbles: true }));
                        }
                    });

                    // 聚焦到最后一个填写的输入框或下一个空输入框
                        const nextIndex = Math.min(numbers.length, inputs.length - 1);
                        if (inputs[nextIndex]) {
                            inputs[nextIndex].focus();
                    }
                }
            });
        });

            // 设置错误监听器
            this.setupErrorListener();
        },

    // 检查验证码是否填写完成
        checkCompletion() {
            if (this.isCodeComplete()) {
                const code = this.getCurrentCode();
                Logger.success(`✅ 验证码填写完成: ${code}`);
            showToast('验证码填写完成！正在自动点击Continue...', 'success');

            // 自动点击Continue按钮
            setTimeout(() => {
                    if (this.clickContinue()) {
                    // 监听验证码错误
                    setTimeout(() => {
                            this.handleError();
                        }, this.config.errorCheckDelay);
                    }
                }, this.config.checkDelay);
            }
        },

        // 自动填充验证码
        async fillCode(code) {
            try {
                Logger.info(`🔧 开始自动填充验证码: ${code}`);
                const inputs = this.getOtpInputs();

                if (inputs.length === 0) {
                    Logger.error('❌ 未找到验证码输入框');

                    // 尝试查找其他可能的验证码输入框
                    const alternativeInputs = document.querySelectorAll('input[type="text"], input[type="number"], input[autocomplete="one-time-code"]');

                    if (alternativeInputs.length > 0) {
                        Logger.info(`🔧 尝试使用替代输入框填充验证码`);
                        return await this.fillCodeToInputs(alternativeInputs, code);
                    }

                    return false;
                }

                Logger.info(`🔧 找到 ${inputs.length} 个验证码输入框`);
                return await this.fillCodeToInputs(inputs, code);
            } catch (error) {
                Logger.error(`❌ 验证码填充过程中出错: ${error.message}`);
                return false;
            }
        },

        // 填充验证码到指定输入框
        async fillCodeToInputs(inputs, code) {
            try {
                Logger.info(`🔧 开始填充验证码到 ${inputs.length} 个输入框`);

                // 确保输入框存在且可操作
                if (!inputs || inputs.length === 0) {
                    Logger.error('❌ 输入框列表为空');
                    return false;
                }

                // 检查输入框是否在DOM中
                for (let i = 0; i < inputs.length; i++) {
                    if (!document.contains(inputs[i])) {
                        Logger.error(`❌ 输入框 ${i} 不在DOM中`);
                        return false;
                    }
                }

                // 清空所有输入框
                this.clearInputs();

                // 等待清空完成
                await new Promise(resolve => setTimeout(resolve, 200));

                // 方法1: 逐位填充验证码
                const codeDigits = code.split('');
                for (let i = 0; i < Math.min(codeDigits.length, inputs.length); i++) {
                    const input = inputs[i];
                    const digit = codeDigits[i];

                    Logger.info(`📝 填充第 ${i + 1} 位: ${digit}`);

                    // 聚焦输入框
                    input.focus();

                    // 设置值并触发多种事件
                    input.value = digit;

                    // 触发输入事件 - 使用更安全的方式
                    try {
                        const inputEvent = new Event('input', { bubbles: true, cancelable: true });
                        const changeEvent = new Event('change', { bubbles: true, cancelable: true });
                        const keydownEvent = new KeyboardEvent('keydown', {
                            key: digit,
                            code: `Digit${digit}`,
                            bubbles: true,
                            cancelable: true
                        });
                        const keyupEvent = new KeyboardEvent('keyup', {
                            key: digit,
                            code: `Digit${digit}`,
                            bubbles: true,
                            cancelable: true
                        });

                        // 安全地触发事件
                        if (input && document.contains(input)) {
                            input.dispatchEvent(keydownEvent);
                            input.dispatchEvent(inputEvent);
                            input.dispatchEvent(keyupEvent);
                            input.dispatchEvent(changeEvent);
                        }
                    } catch (eventError) {
                        Logger.warning(`⚠️ 事件触发失败: ${eventError.message}`);
                        // 继续执行，不中断流程
                    }

                    // 等待一下
                    await new Promise(resolve => setTimeout(resolve, this.config.inputDelay));
                }

                // 验证填充结果
                let currentCode = this.getCurrentCode();
                Logger.info(`📝 当前验证码: ${currentCode}`);

                // 如果方法1失败，尝试方法2: 直接设置所有值
                if (currentCode !== code) {
                    Logger.warning(`⚠️ 方法1失败，尝试方法2: 直接设置值`);

                    try {
                        for (let i = 0; i < Math.min(codeDigits.length, inputs.length); i++) {
                            const input = inputs[i];
                            const digit = codeDigits[i];

                            if (input && document.contains(input)) {
                                // 直接设置值
                                input.value = digit;
                                input.dispatchEvent(new Event('input', { bubbles: true }));
                                input.dispatchEvent(new Event('change', { bubbles: true }));
                            }
                        }
                    } catch (method2Error) {
                        Logger.warning(`⚠️ 方法2执行失败: ${method2Error.message}`);
                    }

                    // 再次验证
                    currentCode = this.getCurrentCode();
                    Logger.info(`📝 方法2后验证码: ${currentCode}`);
                }

                // 如果方法2也失败，尝试方法3: 使用paste事件
                if (currentCode !== code) {
                    Logger.warning(`⚠️ 方法2失败，尝试方法3: 使用paste事件`);

                    try {
                        // 聚焦第一个输入框
                        if (inputs[0] && document.contains(inputs[0])) {
                            inputs[0].focus();

                            // 模拟粘贴事件
                            const pasteEvent = new ClipboardEvent('paste', {
                                bubbles: true,
                                cancelable: true,
                                clipboardData: new DataTransfer()
                            });

                            // 设置剪贴板数据
                            Object.defineProperty(pasteEvent.clipboardData, 'getData', {
                                value: () => code
                            });

                            inputs[0].dispatchEvent(pasteEvent);
                        }
                    } catch (method3Error) {
                        Logger.warning(`⚠️ 方法3执行失败: ${method3Error.message}`);
                    }

                    // 再次验证
                    currentCode = this.getCurrentCode();
                    Logger.info(`📝 方法3后验证码: ${currentCode}`);
                }

                // 最终检查
                if (currentCode === code) {
                    Logger.success('✅ 验证码填充验证成功');
                    return true;
                } else {
                    Logger.warning(`⚠️ 所有方法都失败，期望: ${code}，实际: ${currentCode}`);
                    return false;
                }
            } catch (error) {
                Logger.error(`❌ 验证码填充过程中出错: ${error.message}`);
                return false;
            }
        }
    };




    // ==================== 路由监听器优化 ====================
    const RouteListener = {
        currentUrl: window.location.href,
        checkInterval: null,
        observers: [],
        // 配置
        config: {
            checkInterval: 3000, // 3秒检查一次，而不是1秒
            pageLoadDelay: 1000  // 页面加载延迟
        },

        // 检查URL变化
        checkUrlChange() {
            if (window.location.href !== this.currentUrl) {
                this.currentUrl = window.location.href;
                Logger.info('检测到页面路由变化:', this.currentUrl);

                // 延迟执行，确保页面内容已更新
                setTimeout(() => {
                    PageManager.handleCurrentPage();
                }, this.config.pageLoadDelay);
            }
        },

        // 设置定时检查
        setupIntervalCheck() {
            this.checkInterval = setInterval(() => {
                this.checkUrlChange();
            }, this.config.checkInterval);
        },

        // 设置事件监听
        setupEventListeners() {
            // 监听 popstate 事件（浏览器前进后退）
            const popstateHandler = () => {
            setTimeout(() => {
                    PageManager.handleCurrentPage();
                }, this.config.pageLoadDelay);
            };
            window.addEventListener('popstate', popstateHandler);
            this.observers.push({ type: 'popstate', handler: popstateHandler });

            // 监听 pushstate 和 replacestate（编程式路由）
        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;

            const routeHandler = () => {
                setTimeout(() => {
                    PageManager.handleCurrentPage();
                }, this.config.pageLoadDelay);
            };

        history.pushState = function (...args) {
            originalPushState.apply(history, args);
                routeHandler();
        };

        history.replaceState = function (...args) {
            originalReplaceState.apply(history, args);
                routeHandler();
            };
        },

        // 启动监听
        start() {
            this.setupIntervalCheck();
            this.setupEventListeners();
            Logger.info('🚀 路由监听器已启动');
        },

        // 停止监听
        stop() {
            if (this.checkInterval) {
                clearInterval(this.checkInterval);
                this.checkInterval = null;
            }

            this.observers.forEach(observer => {
                if (observer.type === 'popstate') {
                    window.removeEventListener('popstate', observer.handler);
                }
            });
            this.observers = [];

            Logger.info('🛑 路由监听器已停止');
        }
    };

    // ==================== 应用管理器 ====================
    const AppManager = {
        isInitialized: false,

        // 初始化应用
        init() {
            if (this.isInitialized) {
                Logger.warning('应用已经初始化，跳过重复初始化');
                return;
            }

            // 检查是否已经存在容器
            if (document.getElementById('qoder-userscript-container')) {
                Logger.warning('检测到已存在的容器，跳过初始化');
                return;
            }

            // 使用页面管理器处理当前页面
            PageManager.handleCurrentPage();

            // 启动路由监听器
            RouteListener.start();

            this.isInitialized = true;
            Logger.info('🚀 Qoder 注册助手已加载');
        },

        // 清理资源
        cleanup() {
            RouteListener.stop();
            this.isInitialized = false;
            Logger.info('🧹 应用资源已清理');
        }
    };

    // ==================== 兼容性函数 ====================
    // 为了保持向后兼容，保留原有的函数名但使用新的实现

    // 监听页面路由变化
    function setupRouteChangeListener() {
        return RouteListener.start();
    }

    // 主函数
    function init() {
        return AppManager.init();
    }

    // ==================== 应用启动 ====================
    // 页面加载完成后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            AppManager.init();
        });
    } else {
        AppManager.init();
    }

    // 创建验证码获取按钮
    function createVerificationCodeButton() {
        // 检查是否已经存在验证码获取按钮
        if (document.getElementById('qoder-verification-btn')) {
            return;
        }

        const button = document.createElement('div');
        button.id = 'qoder-verification-btn';
        button.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            z-index: ${CONFIG.ui.buttonZIndex};
            background: linear-gradient(135deg, #FF6B6B 0%, #FF5252 100%);
            color: white;
            border: none;
            border-radius: 8px;
            padding: 12px 20px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            box-shadow: 0 4px 20px rgba(0,0,0,0.15);
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            gap: 8px;
        `;

        button.innerHTML = '📧 获取验证码';

        // 添加悬停效果
        button.addEventListener('mouseenter', () => {
            button.style.transform = 'translateY(-2px)';
            button.style.boxShadow = '0 6px 25px rgba(0,0,0,0.2)';
        });

        button.addEventListener('mouseleave', () => {
            button.style.transform = 'translateY(0)';
            button.style.boxShadow = '0 4px 20px rgba(0,0,0,0.15)';
        });

        // 点击获取验证码
        button.addEventListener('click', async () => {
            Logger.info('📧 用户点击获取验证码按钮');
            button.disabled = true;
            button.innerHTML = '⏳ 获取中...';
            button.style.background = 'linear-gradient(135deg, #FF9800 0%, #F57C00 100%)';
            button.style.cursor = 'not-allowed';

            try {
                await handleOtpStageWithAutoFetch();
            } catch (error) {
                Logger.error(`❌ 验证码获取失败: ${error.message}`);
                showToast('验证码获取失败，请重试', 'error');
            } finally {
                // 恢复按钮状态
                button.disabled = false;
                button.innerHTML = '📧 获取验证码';
                button.style.background = 'linear-gradient(135deg, #FF6B6B 0%, #FF5252 100%)';
                button.style.cursor = 'pointer';
            }
        });

        document.body.appendChild(button);
        Logger.info('✅ 创建验证码获取按钮成功');
    }



})();
