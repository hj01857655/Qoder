// ==UserScript==
// @name         Qoder 注册助手 - 配置版
// @namespace    http://tampermonkey.net/
// @version      1.0
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

    // 所有的元素选择器
    const firstNameSelector = 'input[id="basic_firstName"]';
    const lastNameSelector = 'input[id="basic_lastName"]';
    const emailSelector = 'input[id="basic_email"]';
    const passwordSelector = 'input[id="basic_password"]';
    const captchaSelector = '#captcha-element';
    const continueBtnSelector = 'button.ant-btn-primary, button[type="button"].ant-btn-primary';
    const otpInputsSelector = '.ant-otp-input';
    const checkboxSelector = 'input[class="ant-checkbox-input"][type="checkbox"]';

    // 密码生成器类
    class PasswordGenerator {
        constructor() {
            this.minLength = 8;
            this.maxLength = 20;
            this.charSets = {
                lowercase: 'abcdefghijklmnopqrstuvwxyz',
                uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
                numbers: '0123456789'
            };
        }
        //
        generate(length = 12) {
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

    // 创建密码生成器实例
    const passwordGenerator = new PasswordGenerator();

    // 配置管理器
    class ConfigManager {
        constructor() {
            this.config = this.loadConfig();
        }

        loadConfig() {
            const saved = localStorage.getItem('qoder_config');
            if (saved) {
                try {
                    return JSON.parse(saved);
                } catch (e) {
                    console.log('配置加载失败，使用默认配置');
                }
            }
            return this.getDefaultConfig();
        }

        saveConfig() {
            localStorage.setItem('qoder_config', JSON.stringify(this.config));
        }

        getDefaultConfig() {
            return {
                // 用户自定义域名配置
                customDomains: ['example.com', 'mydomain.com'],
                // 临时邮箱服务配置（用于接收验证码）
                tempEmailServices: [
                    { name: 'tempmail.plus', url: 'https://tempmail.plus', enabled: true }
                ],
                // 邮箱生成配置
                autoFetchVerificationCode: true,
                customEmailPrefix: 'qoder',
                // 临时邮箱服务配置
                tempEmailConfig: {
                    tempmail: '',
                    epin: ''
                }
            };
        }

        updateConfig(newConfig) {
            this.config = { ...this.config, ...newConfig };
            this.saveConfig();
        }

        getCustomDomains() {
            return this.config.customDomains;
        }

        getTempEmailServices() {
            return this.config.tempEmailServices.filter(service => service.enabled);
        }

        isAutoFetchEnabled() {
            return this.config.autoFetchVerificationCode;
        }

        getTempEmailConfig() {
            return this.config.tempEmailConfig;
        }
    }

    // 创建配置管理器实例
    const configManager = new ConfigManager();

    // 临时邮箱服务管理器
    class TempEmailManager {
        constructor() {
            this.currentEmail = null;
            this.emailCheckInterval = null;
            this.maxRetries = 10;
            this.retryDelay = 10000; // 10秒
        }

        // 通用API请求方法
        async makeApiRequest(url, email, epin = '') {
            return new Promise((resolve, reject) => {
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
                    onload: function(response) {
                        try {
                            const data = JSON.parse(response.responseText);
                            resolve(data);
                        } catch (error) {
                            reject(new Error(`解析响应失败: ${error.message}`));
                        }
                    },
                    onerror: function(error) {
                        reject(new Error(`HTTP ${error.status}: ${error.statusText}`));
                    }
                });
            });
        }

        // 获取邮件列表（用于初始化监控）
        async getMailList(email, epin = '', limit = 20) {
            const url = `https://tempmail.plus/api/mails?email=${email}&limit=${limit}&epin=${epin}`;
            const data = await this.makeApiRequest(url, email, epin);
            if (data.result) {
                // 保存first_id用于后续监控
                this.lastFirstId = data.first_id;
            }
            return data;
        }

        // 获取最新邮件（基于first_id监控）
        async getLatestMail(email, epin = '') {
            if (!this.lastFirstId) {
                // 如果没有first_id，先获取邮件列表
                const mailListData = await this.getMailList(email, epin, 20);
                if (!mailListData.result || !mailListData.mail_list || mailListData.mail_list.length === 0) {
                    return null;
                }
            }
            
            // 使用保存的first_id获取最新邮件
            const url = `https://tempmail.plus/api/mails?email=${email}&limit=10&epin=${epin}&first_id=${this.lastFirstId}`;
            const data = await this.makeApiRequest(url, email, epin);
            
            // 无论是否有新邮件，都要更新first_id
            if (data.result) {
                const oldFirstId = this.lastFirstId;
                this.lastFirstId = data.first_id;
                
                if (data.mail_list && data.mail_list.length > 0) {
                    addLog(`📨 发现 ${data.count} 封新邮件，更新first_id: ${oldFirstId} -> ${this.lastFirstId}`, 'success');
                } else {
                    addLog(`📭 暂无新邮件，first_id: ${this.lastFirstId}`, 'info');
                }
            }
            
            if (data.result && data.mail_list && data.mail_list.length > 0) {
                return data.mail_list[0]; // 返回最新的一封邮件
            }
            return null;
        }

        // 获取邮件详情
        async getMailDetail(mailId, email, epin = '') {
            const url = `https://tempmail.plus/api/mail/${mailId}?email=${email}&epin=${epin}`;
            return await this.makeApiRequest(url, email, epin);
        }

        // 获取验证码
        async getVerificationCode(timeout = 60000) { // 默认60秒超时
            if (!this.currentEmail) {
                addLog('❌ 没有可用的临时邮箱', 'error');
                return null;
            }

            addLog(`🔍 开始监听邮箱: ${this.currentEmail}`, 'info');
            addLog(`⏰ 超时时间: ${timeout / 1000}秒`, 'info');

            return new Promise((resolve) => {
                let retryCount = 0;
                const startTime = Date.now();

                const checkEmail = async () => {
                    try {
                        if (Date.now() - startTime > timeout) {
                            addLog('⏰ 邮箱监听超时', 'warning');
                            this.stopEmailCheck();
                            resolve(null);
                            return;
                        }

                        // 从配置中获取tempmail配置
                        const tempEmailConfig = configManager.getTempEmailConfig();
                        const tempmailConfig = tempEmailConfig.tempmail;
                        
                        if (!tempmailConfig) {
                            throw new Error('未配置tempmail.plus服务');
                        }
                        
                        // 解析配置中的email和epin
                        const [configEmail, epin] = tempmailConfig.split('&epin=');
                        
                        // 使用当前邮箱（从页面提取的）而不是配置中的邮箱
                        const email = this.currentEmail || configEmail;
                        
                        // 使用getLatestMail获取最新邮件
                        const latestMail = await this.getLatestMail(email, epin);
                        
                        if (latestMail) {
                            // 检查是否来自Qoder
                            if (latestMail.from_mail && latestMail.from_mail.toLowerCase().includes('qoder')) {
                                addLog(`📨 找到Qoder邮件: ${latestMail.subject}`, 'success');

                                // 获取邮件内容
                                const mailContent = await this.getMailContent(latestMail.mail_id, email, epin);
                                
                                if (mailContent) {
                                    // 提取验证码
                                    const verificationCode = this.extractVerificationCode(mailContent);

                                    if (verificationCode) {
                                        addLog(`✅ 验证码提取成功: ${verificationCode}`, 'success');
                                        this.stopEmailCheck();
                                        resolve(verificationCode);
                                        return;
                                    } else {
                                        addLog('⚠️ 邮件中未找到验证码', 'warning');
                                    }
                                }
                            } else {
                                addLog('📧 最新邮件不是来自Qoder，继续监听...', 'info');
                            }
                        } else {
                            addLog('📭 暂无新邮件，继续监听...', 'info');
                        }

                        retryCount++;
                        if (retryCount >= this.maxRetries) {
                            addLog('❌ 达到最大重试次数，停止监听', 'error');
                            this.stopEmailCheck();
                            resolve(null);
                            return;
                        }

                        // 继续监听
                        setTimeout(checkEmail, this.retryDelay);

                    } catch (error) {
                        addLog(`❌ 邮箱检查失败: ${error.message}`, 'error');
                        retryCount++;

                        if (retryCount >= this.maxRetries) {
                            this.stopEmailCheck();
                            resolve(null);
                        } else {
                            setTimeout(checkEmail, this.retryDelay);
                        }
                    }
                };

                // 开始检查
                checkEmail();
            });
        }

        // 获取邮件内容
        async getMailContent(mailId, email, epin) {
            try {
                const data = await this.getMailDetail(mailId, email, epin);
                
                if (data.result && data.mail) {
                    return data.mail.body || data.mail.text || '';
                }
                
                return null;
            } catch (error) {
                addLog(`❌ 获取邮件内容失败: ${error.message}`, 'error');
                return null;
            }
        }

        // 提取验证码
        extractVerificationCode(emailContent) {
            if (!emailContent) return null;

            // 匹配带空格的6位数字验证码
            const codeMatch = emailContent.match(/(\d{1}\s+\d{1}\s+\d{1}\s+\d{1}\s+\d{1}\s+\d{1})/);
            return codeMatch ? codeMatch[0].replace(/\s+/g, '') : null;
        }

        // 停止邮箱检查
        stopEmailCheck() {
            if (this.emailCheckInterval) {
                clearInterval(this.emailCheckInterval);
                this.emailCheckInterval = null;
            }
        }
    }

    // 创建临时邮箱管理器实例
    const tempEmailManager = new TempEmailManager();

    // 用户名生成器
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

    // 邮箱生成器 - 配置版
    async function generateEmail() {
        // 只使用自定义域名模式
        addLog('📧 使用自定义域名模式', 'info');
        const customDomains = configManager.getCustomDomains();

        if (customDomains.length === 0) {
            addLog('❌ 未配置自定义域名，请先在配置面板中设置域名', 'error');
            showToast('请先在配置面板中设置自定义域名', 'error');
            return null;
        }

        const selectedCustomDomain = customDomains[Math.floor(Math.random() * customDomains.length)];
        const customEmail = generateRandomEmail(selectedCustomDomain);
        addLog(`✅ 生成自定义域名邮箱: ${customEmail}`, 'success');
        return customEmail;
    }



    // 生成随机邮箱的辅助函数
    function generateRandomEmail(domain) {
        const adjectives = ['cool', 'smart', 'happy', 'bright', 'quick', 'fast', 'super', 'mega', 'ultra', 'pro'];
        const nouns = ['coder', 'dev', 'hacker', 'geek', 'ninja', 'master', 'guru', 'wizard', 'hero', 'star'];
        const numbers = Math.floor(Math.random() * 10000);

        const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
        const noun = nouns[Math.floor(Math.random() * nouns.length)];

        return `${adjective}${noun}${numbers}@${domain}`;
    }

    // 改进的输入值设置方法 - 针对React Ant Design表单
    function setInputValue(input, value) {
        console.log(`🔧 开始设置 ${input.id} 的值为: ${value}`);

        let successMethod = '未知';
        let originalValue = input.value;

        // 清空现有值
        input.value = '';
        input.focus();
        input.select();




        // // 直接调用React的onChange回调
        try {
            console.log('🔄直接调用React onChange');
            // 查找React组件实例
            const reactKey = Object.keys(input).find(key => key.startsWith('__reactProps$'));
            if (reactKey && input[reactKey] && input[reactKey].onChange) {
                console.log('找到React组件实例，调用onChange');
                input[reactKey].onChange({
                    target: { value: value },
                    currentTarget: { value: value },
                    type: 'change'
                });
                if (input.value === value && successMethod === '未知') {
                    successMethod = ' 直接调用React onChange';
                    console.log(`✅ ${successMethod} 成功`);
                }
            } else {
                console.log('❌ 未找到React组件实例或onChange回调');
            }
        } catch (e) {
            console.log('❌ React onChange调用失败:', e);
        }


        // 最终验证和报告
        setTimeout(() => {
            console.log(`📊 ${input.id} 最终验证结果:`);
            console.log(`   原始值: "${originalValue}"`);
            console.log(`   目标值: "${value}"`);
            console.log(`   当前值: "${input.value}"`);
            console.log(`   是否成功: ${input.value === value ? '✅ 是' : '❌ 否'}`);


        }, 100);
    }

    // 创建注册助手面板
    function createRegisterPanel() {
        const panel = document.createElement('div');
        panel.id = 'qoder-register-panel';
        panel.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 10002;
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

    // 创建悬浮按钮
    function createFloatingButton() {
        const button = document.createElement('div');
        button.id = 'qoder-floating-btn';
        button.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 10001;
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
        button.title = '打开注册助手面板（配置版）';

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

        return button;
    }

    // 创建登录页面的注册助手入口按钮
    function createSigninPageButton() {
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
            z-index: 10001;
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
            console.log('点击注册助手入口，跳转到注册页面');
            window.location.href = '/users/sign-up';
        });

        document.body.appendChild(button);
        console.log('创建登录页面注册助手入口按钮');
    }

        // 检测注册页面
    function DetectSignupPage() {
        // 检测是否在注册页面
        if (!window.location.href.includes('/users/sign-up')) {
            console.log('不在注册页面，跳过注册面板');
            return;
        }

        console.log('在注册页面，开始注册助手...');

        // 等待页面元素加载
        setTimeout(() => {
            // 检查是否在验证码页面
            const otpInputs = document.querySelectorAll(otpInputsSelector);
            if (otpInputs.length > 0) {
                // 在验证码页面，直接处理验证码
                addLog('📧 检测到验证码页面，开始自动获取验证码', 'info');
                
                // 检查是否有当前邮箱
                if (!tempEmailManager.currentEmail) {
                    addLog('❌ 未找到当前邮箱，无法自动获取验证码', 'error');
                    showToast('请先完成注册流程或手动输入验证码', 'warning');
                    return;
                }
                
                addLog(`📧 使用邮箱: ${tempEmailManager.currentEmail}`, 'info');
                handleOtpStageWithAutoFetch();
                return;
            }
            
            // 自动勾选复选框
            autoCheckCheckbox();
            
            // 创建悬浮按钮（如果不存在）
            let floatingBtn = document.getElementById('qoder-floating-btn');
            if (!floatingBtn) {
                floatingBtn = createFloatingButton();
                document.body.appendChild(floatingBtn);
                console.log('创建悬浮按钮');
            }
            
            // 显示注册机面板
            showRegisterPanel();
        }, 1000);
    }

    // 检测登录页面
    function DetectSigninPage() {
        // 检测是否在登录页面
        if (!window.location.href.includes('/users/sign-in')) {
            return;
        }

        console.log('在登录页面，添加注册助手入口...');

        // 等待页面元素加载
        setTimeout(() => {
            // 创建注册机入口按钮
            createSigninPageButton();
        }, 1000);
    }

    // 自动勾选复选框
    function autoCheckCheckbox() {
        const checkbox = document.querySelector(checkboxSelector);
        console.log('查找复选框元素:', checkbox);

        if (checkbox && !checkbox.checked) {
            console.log('自动勾选复选框:', checkbox);
            checkbox.click();
            console.log('自动勾选复选框完成');
        } else if (checkbox && checkbox.checked) {
            console.log('复选框已经勾选');
        } else {
            console.log('未找到复选框');
        }
    }

    // 显示注册机面板
    function showRegisterPanel() {
        // 只在注册页面显示
        if (!window.location.href.includes('/users/sign-up')) {
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

            console.log('创建注册面板');
        }

        panel.style.display = 'block';

        // 隐藏悬浮按钮
        const floatingBtn = document.getElementById('qoder-floating-btn');
        if (floatingBtn) {
            floatingBtn.style.display = 'none';
        }

        // 启动阶段监控（避免重复设置）
        if (!window.stageMonitorInterval) {
            updateCurrentStage();
            window.stageMonitorInterval = setInterval(updateCurrentStage, 2000);
        }

        // 添加初始日志
        addLog('面板已打开，等待开始注册...', 'info');
    }

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
                <button id="save-config" style="padding: 10px 20px; background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%); color: white; border: none; border-radius: 6px; font-size: 14px; cursor: pointer;">保存配置</button>
                <button id="reset-config" style="padding: 10px 20px; background: linear-gradient(135deg, #FF9800 0%, #F57C00 100%); color: white; border: none; border-radius: 6px; font-size: 14px; cursor: pointer;">重置默认</button>
            </div>
        `;

        // 绑定配置面板事件
        setTimeout(() => {
            document.getElementById('close-config-panel').addEventListener('click', () => {
                configPanel.style.display = 'none';
            });

            document.getElementById('save-config').addEventListener('click', saveConfig);
            document.getElementById('reset-config').addEventListener('click', resetConfig);
        }, 100);

        return panel;
    }

    // 测试配置
    async function testConfig(config) {
        try {
            // 测试tempmail配置
            if (config.tempEmailConfig && config.tempEmailConfig.tempmail) {
                const tempmailConfig = config.tempEmailConfig.tempmail;
                
                // 解析email和epin
                const [email, epin] = tempmailConfig.split('&epin=');
                
                if (!email) {
                    addLog('❌ tempmail配置格式错误', 'error');
                    return false;
                }
                
                // 使用TempEmailManager测试API调用
                const tempEmailManager = new TempEmailManager();
                try {
                    const data = await tempEmailManager.getMailList(email, epin, 5);
                    
                    // 检查API错误响应
                    if (!data.result && data.err) {
                        if (data.err.code === 1021 && data.err.msg === "Pin not valid.") {
                            addLog('❌ epin无效，请检查epin配置', 'error');
                            return false;
                        }
                        addLog(`❌ tempmail API错误: ${data.err.msg}`, 'error');
                        return false;
                    }
                    
                    addLog('✅ tempmail配置验证通过', 'success');
                    return true;
                } catch (error) {
                    addLog(`❌ tempmail API调用失败: ${error.message}`, 'error');
                    return false;
                }
                
                if (!testResult) {
                    return false;
                }
            }
            
            return true;
        } catch (error) {
            addLog(`❌ 配置测试失败: ${error.message}`, 'error');
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
                epin: epin
            }
        };

                // 测试配置
        addLog('🧪 正在测试配置...', 'info');
        const testResult = await testConfig(newConfig);
        
        if (testResult) {
            configManager.updateConfig(newConfig);
            addLog('✅ 配置验证通过，已保存', 'success');
            showToast('配置验证通过，已保存', 'success');
        } else {
            addLog('❌ 配置验证失败，请检查配置', 'error');
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

        addLog('🔄 配置已重置为默认值', 'info');
        showToast('配置已重置为默认值', 'info');
    }

    // 更新当前阶段显示
    function updateCurrentStage() {
        const stageInfo = document.getElementById('stage-info');
        if (!stageInfo) return;

        // 重新检测当前表单阶段
        const firstNameInput = document.querySelector(firstNameSelector);
        const lastNameInput = document.querySelector(lastNameSelector);
        const emailInput = document.querySelector(emailSelector);
        const passwordInput = document.querySelector(passwordSelector);
        const captchaElement = document.querySelector(captchaSelector);
        const otpInputs = document.querySelectorAll(otpInputsSelector);

        let stageText = '';
        let stageColor = '#666';

        if (firstNameInput && lastNameInput && emailInput) {
            stageText = '第一阶段：姓名和邮箱填写';
            stageColor = '#2196F3';
        } else if (passwordInput) {
            stageText = '第二阶段：密码设置';
            stageColor = '#FF9800';
        } else if (captchaElement) {
            stageText = '第三阶段：人机验证';
            stageColor = '#9C27B0';
        } else if (otpInputs.length > 0) {
            stageText = '第四阶段：邮箱验证码';
            stageColor = '#4CAF50';
        } else {
            stageText = '未知阶段：等待页面加载';
            stageColor = '#666';
        }

        stageInfo.textContent = stageText;
        stageInfo.style.color = stageColor;
    }



    // 开始注册流程 - 配置版
    async function startRegistration() {
        addLog('🚀 开始注册流程（配置版）', 'info');
        updateButtonState(true); // 设置按钮为运行状态

        try {
            // 验证配置
            const config = configManager.config;
            
            // 检查自定义域名配置
            if (!config.customDomains || config.customDomains.length === 0) {
                addLog('❌ 未配置自定义域名，请先在配置面板中设置域名', 'error');
                showToast('请先在配置面板中设置自定义域名', 'error');
                updateButtonState(false);
                return;
            }
            
            // 检查tempmail配置
            if (!config.tempEmailConfig || !config.tempEmailConfig.tempmail) {
                addLog('❌ 未配置tempmail.plus服务，请先在配置面板中设置', 'error');
                showToast('请先在配置面板中设置tempmail.plus服务', 'error');
                updateButtonState(false);
                return;
            }
            
            // 检查epin配置（可为空，但如果有值需要验证格式）
            if (config.tempEmailConfig.epin && config.tempEmailConfig.epin.trim() === '') {
                addLog('⚠️ epin配置为空，如果临时邮箱服务需要epin，请配置正确的值', 'warning');
            }
            
            addLog('✅ 配置验证通过', 'success');

            // 生成用户信息（异步）
            const userInfo = {
                firstName: generateFirstName(),
                lastName: generateLastName(),
                email: await generateEmail(), // 异步生成邮箱
                password: passwordGenerator.generate(12)
            };

            // 保存生成的邮箱到临时邮箱管理器（用于后续获取验证码）
            tempEmailManager.currentEmail = userInfo.email;

            addLog(`📝 生成注册数据: ${userInfo.firstName} ${userInfo.lastName} | ${userInfo.email}`, 'info');

            // 重新检测当前表单阶段
            const firstNameInput = document.querySelector(firstNameSelector);
            const lastNameInput = document.querySelector(lastNameSelector);
            const emailInput = document.querySelector(emailSelector);
            const passwordInput = document.querySelector(passwordSelector);
            const captchaElement = document.querySelector(captchaSelector);
            const otpInputs = document.querySelectorAll(otpInputsSelector);

            if (firstNameInput && lastNameInput && emailInput) {
                // 第一阶段：填写姓名和邮箱，然后点击Continue
                addLog('📋 第一阶段：填写姓名和邮箱', 'info');
                fillFirstStageForm(userInfo);

                // 等待填写完成后点击Continue
                setTimeout(() => {
                    const continueBtn = document.querySelector(continueBtnSelector);
                    if (continueBtn) {
                        addLog('🔄 点击Continue按钮进入密码设置', 'info');
                        continueBtn.click();
                        showToast('已跳转到密码设置页面', 'success');

                        // 等待页面跳转后自动填写密码
                        setTimeout(() => {
                            addLog('⏳ 等待页面跳转完成，开始填写密码', 'info');
                            fillSecondStageForm(userInfo);
                        }, 4000); // 增加页面跳转等待时间
                    } else {
                        addLog('❌ 未找到Continue按钮', 'error');
                        updateButtonState(false);
                    }
                }, 3000); // 增加点击Continue前的等待时间
            } else if (passwordInput) {
                // 第二阶段：填写密码，然后点击Continue
                addLog('🔐 第二阶段：填写密码', 'info');
                fillSecondStageForm(userInfo);

                // 等待填写完成后点击Continue
                setTimeout(() => {
                    const continueBtn = document.querySelector(continueBtnSelector);
                    if (continueBtn) {
                        addLog('🔄 点击Continue按钮进入人机验证', 'info');
                        continueBtn.click();
                        showToast('已跳转到人机验证页面', 'success');
                    } else {
                        addLog('❌ 未找到Continue按钮', 'error');
                        updateButtonState(false);
                    }
                }, 3000); // 增加点击Continue前的等待时间
            } else if (captchaElement) {
                // 第三阶段：开始人机验证
                addLog('🤖 第三阶段：开始人机验证', 'info');
                simulateHumanVerification();
            } else if (otpInputs.length > 0) {
                // 第四阶段：邮箱验证码
                addLog('📧 第四阶段：邮箱验证码页面', 'info');

                // 检查是否启用自动获取验证码
                if (configManager.isAutoFetchEnabled()) {
                    addLog('🤖 启用自动验证码获取模式', 'info');
                    await handleOtpStageWithAutoFetch();
                } else {
                    showToast('当前是邮箱验证码阶段，请手动输入验证码后点击Continue', 'info');
                    handleOtpStage();
                }
                updateButtonState(false);
            } else {
                addLog('⏳ 未检测到表单字段，等待页面加载', 'warning');
                showToast('正在等待页面加载...', 'info');
                updateButtonState(false);
            }
        } catch (error) {
            addLog(`❌ 注册流程出错: ${error.message}`, 'error');
            showToast('注册流程出错，请重试', 'error');
            updateButtonState(false);
        }
    }

    // 填写第一阶段表单
    function fillFirstStageForm(userInfo) {
        const firstNameInput = document.querySelector(firstNameSelector);
        const lastNameInput = document.querySelector(lastNameSelector);
        const emailInput = document.querySelector(emailSelector);

        if (!firstNameInput || !lastNameInput || !emailInput) {
            addLog('❌ 未找到第一阶段表单字段', 'error');
            showToast('未找到第一阶段表单字段', 'error');
            updateButtonState(false);
            return;
        }

        addLog('📝 开始填写第一阶段表单', 'info');

        // 依次设置每个字段，增加间隔时间
        setInputValue(firstNameInput, userInfo.firstName);
        addLog(`✅ 填写姓名: ${userInfo.firstName}`, 'success');

        setTimeout(() => {
            setInputValue(lastNameInput, userInfo.lastName);
            addLog(`✅ 填写姓氏: ${userInfo.lastName}`, 'success');
        }, 800);

        setTimeout(() => {
            setInputValue(emailInput, userInfo.email);
            addLog(`✅ 填写邮箱: ${userInfo.email}`, 'success');
        }, 1600);

        // 确保复选框已勾选
        setTimeout(() => {
            const checkbox = document.querySelector(checkboxSelector);
            if (checkbox && !checkbox.checked) {
                checkbox.click();
                addLog('✅ 自动勾选复选框', 'success');
            } else if (checkbox && checkbox.checked) {
                addLog('ℹ️ 复选框已经勾选', 'info');
            }

            addLog('🎉 第一阶段表单填写完成', 'success');
            showToast('第一阶段表单填写完成！请点击Continue进入密码设置', 'success');
        }, 2400);
    }

    // 填写第二阶段表单
    function fillSecondStageForm(userInfo) {
        const passwordInput = document.querySelector(passwordSelector);

        if (!passwordInput) {
            addLog('❌ 未找到密码输入字段', 'error');
            showToast('未找到密码输入字段', 'error');
            updateButtonState(false);
            return;
        }

        addLog('🔐 开始填写第二阶段表单', 'info');

        // 设置密码字段
        setInputValue(passwordInput, userInfo.password);
        addLog(`✅ 填写密码: ${userInfo.password}`, 'success');

        addLog('🎉 第二阶段表单填写完成', 'success');
        showToast('密码设置完成！', 'success');

        // 等待密码填写完成后自动点击Continue
        setTimeout(() => {
            const continueBtn = document.querySelector(continueBtnSelector);
            if (continueBtn) {
                addLog('🔄 密码填写完成，点击Continue按钮进入人机验证', 'info');
                continueBtn.click();
                showToast('已跳转到人机验证页面', 'success');

                // 等待页面跳转后自动开始人机验证
                setTimeout(() => {
                    addLog('⏳ 等待人机验证页面加载完成', 'info');
                    simulateHumanVerification();
                }, 4000); // 增加页面跳转等待时间
            } else {
                addLog('❌ 未找到Continue按钮', 'error');
                updateButtonState(false);
            }
        }, 3000); // 增加点击Continue前的等待时间
    }

    // 日志记录功能
    let logCount = 0;
    const maxLogs = 100; // 最大日志条数

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
        addLog('🤖 开始模拟人机验证', 'info');

        // 检查是否有错误信息
        const errorMessage = document.querySelector('.ant-alert-message');
        if (errorMessage) {
            const errorText = errorMessage.textContent.trim();
            addLog(`❌ 检测到错误: ${errorText}`, 'error');
            
            // 特殊处理人机验证错误
            if (errorText.includes('Unable to verify the user is human')) {
                addLog('🤖 检测到人机验证失败，需要手动完成验证', 'warning');
                showToast('请手动完成人机验证后重试', 'warning');
                updateButtonState(false);
                return;
            }
        }

        // 查找验证码复选框元素
        const captchaCheckbox = document.querySelector('#aliyunCaptcha-checkbox-icon');
        const checkedIcon = document.querySelector('.aliyunCaptcha-checkbox-icon-checked');

        if (!captchaCheckbox) {
            addLog('❌ 未找到验证码复选框元素', 'error');
            showToast('未找到验证码复选框元素', 'error');
            updateButtonState(false);
            return;
        }

        if (!checkedIcon) {
            addLog('❌ 未找到验证码图标元素', 'error');
            showToast('未找到验证码图标元素', 'error');
            updateButtonState(false);
            return;
        }

        addLog('✅ 找到验证码元素，开始验证', 'success');
        showToast('开始模拟人机验证...', 'info');

        // 检查是否已经验证过 - 验证成功的真实标志
        const checkboxBody = captchaCheckbox.closest('#aliyunCaptcha-checkbox-body');
        const checkboxText = document.querySelector('#aliyunCaptcha-checkbox-text');

        // 检查验证成功的真实标志
        const hasVerifiedClass = checkboxBody && checkboxBody.classList.contains('verified');
        const hasVerifiedText = checkboxText && checkboxText.textContent === 'Verified';

        if (hasVerifiedClass && hasVerifiedText) {
            addLog('🎉 验证码已经通过验证', 'success');
            addLog(`  - verified类: ${hasVerifiedClass}`, 'debug');
            addLog(`  - verified文本: ${hasVerifiedText}`, 'debug');
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
        const maxRetries = 3;

        // 创建频繁检查函数
        function checkVerificationStatus() {
            const checkboxBody = captchaCheckbox.closest('#aliyunCaptcha-checkbox-body');
            const checkboxText = document.querySelector('#aliyunCaptcha-checkbox-text');

            const hasVerifiedClass = checkboxBody && checkboxBody.classList.contains('verified');
            const hasVerifiedText = checkboxText && checkboxText.textContent === 'Verified';

            if (hasVerifiedClass && hasVerifiedText) {
                addLog('🎉 验证成功！检测到验证状态', 'success');
                addLog(`  - verified类: ${hasVerifiedClass}`, 'debug');
                addLog(`  - verified文本: ${hasVerifiedText}`, 'debug');
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
            addLog('⏰ 验证超时，检查验证状态', 'warning');

            if (checkVerificationStatus()) {
                return; // 如果验证成功，停止检查
            }

            // 验证失败，尝试重试
            retryCount++;
            if (retryCount < maxRetries) {
                addLog(`⚠️ 验证可能失败，尝试重新点击... (第${retryCount}次重试)`, 'warning');
                showToast(`验证可能失败，尝试重新点击... (第${retryCount}次重试)`, 'warning');

                // 重试逻辑
                setTimeout(() => {
                    addLog('🔄 开始重试验证', 'info');
                    simulateHumanClick(checkedIcon);
                }, 2000);
            } else {
                addLog('❌ 验证失败，已达到最大重试次数', 'error');
                showToast('验证失败，已达到最大重试次数', 'error');
                updateButtonState(false);
            }

            // 清理定时器
            if (checkInterval) {
                clearInterval(checkInterval);
            }
            observer.disconnect();
        }, 8000); // 减少到8秒超时
    }

    // 模拟人类鼠标移动
    function simulateHumanMouseMovement(targetElement) {
        console.log('模拟鼠标移动...');

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
                        console.log('鼠标移动事件失败:', e);
                    }
                }, index * (15 + Math.random() * 10)); // 增加时间间隔
            });
        } catch (e) {
            console.log('鼠标移动模拟失败:', e);
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
        console.log('模拟点击行为...');

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

                                            console.log('点击模拟完成');
                                        } catch (e) {
                                            console.log('点击事件失败:', e);
                                            // 备用方案：直接调用click方法
                                            try {
                                                targetElement.click();
                                                console.log('备用点击方法成功');
                                            } catch (e2) {
                                                console.log('备用点击方法也失败:', e2);
                                            }
                                        }
                                    }, 10 + Math.random() * 50);
                                } catch (e) {
                                    console.log('mouseup事件失败:', e);
                                }
                            }, 50 + Math.random() * 100); // 随机按下时间
                        } catch (e) {
                            console.log('mousedown事件失败:', e);
                        }
                    }, 100 + Math.random() * 200); // 随机悬停时间
                } catch (e) {
                    console.log('mouseenter事件失败:', e);
                }
            }, 500 + Math.random() * 1000); // 随机延迟
        } catch (e) {
            console.log('模拟点击整体失败:', e);
            // 最后的备用方案
            try {
                targetElement.click();
                console.log('最终备用点击方法成功');
            } catch (e2) {
                console.log('最终备用点击方法也失败:', e2);
            }
        }
    }

    // 主函数
    function init() {
        // 检查是否已经存在容器
        if (document.getElementById('qoder-userscript-container')) {
            return;
        }

        // 检测当前页面类型
        if (window.location.href.includes('/users/sign-up')) {
            // 注册页面
            DetectSignupPage();
        } else if (window.location.href.includes('/users/sign-in')) {
            // 登录页面
            DetectSigninPage();
        }

        console.log('🚀 Qoder 注册助手已加载');
    }

    // 自动验证码获取处理函数
    async function handleOtpStageWithAutoFetch() {
        addLog('🤖 开始自动验证码获取流程', 'info');

        // 设置验证码输入框的优化体验
        handleOtpStage();

        // 从页面提取邮箱地址
        const emailSpan = document.querySelector('.verificationCode--o_u9MiU span');
        let pageEmail = null;
        if (emailSpan) {
            const emailText = emailSpan.textContent;
            const emailMatch = emailText.match(/sent to ([^:]+):/);
            if (emailMatch) {
                pageEmail = emailMatch[1].trim();
                addLog(`📧 从页面提取到邮箱: ${pageEmail}`, 'info');
            }
        }

        if (!pageEmail) {
            addLog('❌ 无法从页面获取邮箱地址', 'error');
            showToast('无法获取邮箱地址，请手动输入验证码', 'error');
            return;
        }

        // 更新临时邮箱管理器的当前邮箱
        tempEmailManager.currentEmail = pageEmail;

        // 开始自动获取验证码
        addLog(`📧 开始监听邮箱 ${tempEmailManager.currentEmail} 获取验证码...`, 'info');

        try {
            const verificationCode = await tempEmailManager.getVerificationCode(60000); // 60秒超时

            if (verificationCode) {
                addLog(`✅ 自动获取到验证码: ${verificationCode}`, 'success');
                showToast(`自动获取验证码成功: ${verificationCode}`, 'success');

                // 自动填充验证码
                await autoFillVerificationCode(verificationCode);

                // 自动点击Continue
                setTimeout(() => {
                    const continueBtn = document.querySelector(continueBtnSelector);
                    if (continueBtn) {
                        addLog('🔄 自动点击Continue按钮', 'info');
                        continueBtn.click();
                        showToast('验证码已自动提交，正在完成注册...', 'success');
                    } else {
                        addLog('❌ 未找到Continue按钮', 'error');
                        showToast('请手动点击Continue按钮', 'warning');
                    }
                }, 2000);

            } else {
                addLog('❌ 自动获取验证码失败', 'error');
                showToast('自动获取验证码失败，请手动输入', 'error');

            }
        } catch (error) {
            addLog(`❌ 自动验证码获取出错: ${error.message}`, 'error');
            showToast('自动验证码获取出错，请手动输入', 'error');
        }
    }

    // 自动填充验证码
    async function autoFillVerificationCode(code) {
        const otpInputs = document.querySelectorAll('.ant-otp-input');

        if (otpInputs.length === 0) {
            addLog('❌ 未找到验证码输入框', 'error');
            return false;
        }

        addLog(`🔧 开始自动填充验证码: ${code}`, 'info');

        // 清空所有输入框
        otpInputs.forEach(input => {
            input.value = '';
        });

        // 逐位填充验证码
        const codeDigits = code.split('');
        for (let i = 0; i < Math.min(codeDigits.length, otpInputs.length); i++) {
            const input = otpInputs[i];
            const digit = codeDigits[i];

            // 设置值
            input.value = digit;

            // 触发input事件
            input.dispatchEvent(new Event('input', { bubbles: true }));

            // 短暂延迟
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        addLog('✅ 验证码自动填充完成', 'success');
        return true;
    }

    // 验证码填充优化处理函数
    function handleOtpStage() {
        addLog('🔧 开始优化验证码填充体验', 'info');

        // 获取所有验证码输入框
        const otpInputs = document.querySelectorAll('.ant-otp-input');

        if (otpInputs.length === 0) {
            addLog('❌ 未找到验证码输入框', 'error');
            return;
        }

        addLog(`✅ 找到 ${otpInputs.length} 个验证码输入框`, 'success');

        // 自动聚焦到第一个输入框
        setTimeout(() => {
            if (otpInputs[0]) {
                otpInputs[0].focus();
                addLog('🎯 自动聚焦到第一个验证码输入框', 'success');
            }
        }, 500);

        // 设置错误监听器
        setupOtpErrorListener();

        // 为每个输入框添加事件监听
        otpInputs.forEach((input, index) => {
            // 填充事件监听
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
                if (value.length === 1 && index < otpInputs.length - 1) {
                    setTimeout(() => {
                        otpInputs[index + 1].focus();
                    }, 100);
                }

                // 检查是否所有输入框都已填写
                checkOtpCompletion();
            });

            // 退格键处理
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Backspace' && e.target.value === '' && index > 0) {
                    setTimeout(() => {
                        otpInputs[index - 1].focus();
                    }, 100);
                }
            });

            // 粘贴事件处理
            input.addEventListener('paste', (e) => {
                e.preventDefault();
                const pastedData = e.clipboardData.getData('text');
                const numbers = pastedData.replace(/\D/g, '').slice(0, otpInputs.length);

                if (numbers.length > 0) {
                    // 填充所有输入框
                    numbers.split('').forEach((num, i) => {
                        if (otpInputs[i]) {
                            otpInputs[i].value = num;
                            // 触发input事件
                            otpInputs[i].dispatchEvent(new Event('input', { bubbles: true }));
                        }
                    });

                    // 聚焦到最后一个填写的输入框或下一个空输入框
                    const nextIndex = Math.min(numbers.length, otpInputs.length - 1);
                    if (otpInputs[nextIndex]) {
                        otpInputs[nextIndex].focus();
                    }
                }
            });
        });

        // 添加验证码填充提示
        addOtpInputHint();
    }

    // 设置验证码错误监听器
    function setupOtpErrorListener() {
        // 使用MutationObserver监听错误提示的出现
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            // 检查是否添加了错误提示
                            const errorAlert = node.querySelector('.alert--cQdh1TE');
                            if (errorAlert && errorAlert.textContent.includes('expired or incorrect')) {
                                addLog('❌ 检测到验证码错误提示', 'error');
                                showToast('验证码错误或已过期，请重新输入', 'error');

                                // 清空所有输入框
                                clearOtpInputs();

                                // 重新聚焦到第一个输入框
                                const otpInputs = document.querySelectorAll('.ant-otp-input');
                                if (otpInputs[0]) {
                                    setTimeout(() => {
                                        otpInputs[0].focus();
                                        addLog('🔄 已清空验证码输入框，请重新输入', 'info');
                                    }, 500);
                                }
                            }
                        }
                    });
                }
            });
        });

        // 监听验证码容器
        const otpContainer = document.querySelector('.verificationCode--o_u9MiU');
        if (otpContainer) {
            observer.observe(otpContainer, {
                childList: true,
                subtree: true
            });
            addLog('👂 已设置验证码错误监听器', 'info');
        }
    }

    // 检查验证码是否填写完成
    function checkOtpCompletion() {
        const otpInputs = document.querySelectorAll('.ant-otp-input');
        const otpCode = Array.from(otpInputs).map(input => input.value).join('');

        if (otpCode.length === otpInputs.length) {
            addLog(`✅ 验证码填写完成: ${otpCode}`, 'success');
            showToast('验证码填写完成！正在自动点击Continue...', 'success');

            // 自动点击Continue按钮
            setTimeout(() => {
                const continueBtn = document.querySelector(continueBtnSelector);
                if (continueBtn) {
                    addLog('🔄 自动点击Continue按钮', 'info');
                    continueBtn.click();

                    // 监听验证码错误
                    setTimeout(() => {
                        checkOtpError();
                    }, 2000);
                } else {
                    addLog('❌ 未找到Continue按钮', 'error');
                    showToast('请手动点击Continue按钮', 'warning');
                }
            }, 1000);
        }
    }

    // 检查验证码错误
    function checkOtpError() {
        const errorAlert = document.querySelector('.alert--cQdh1TE');
        if (errorAlert && errorAlert.textContent.includes('expired or incorrect')) {
            addLog('❌ 验证码错误或已过期', 'error');
            showToast('验证码错误或已过期，请重新输入', 'error');

            // 清空所有输入框
            clearOtpInputs();

            // 重新聚焦到第一个输入框
            const otpInputs = document.querySelectorAll('.ant-otp-input');
            if (otpInputs[0]) {
                otpInputs[0].focus();
                addLog('🔄 已清空验证码输入框，请重新输入', 'info');
            }
        }
    }

    // 清空验证码输入框
    function clearOtpInputs() {
        const otpInputs = document.querySelectorAll('.ant-otp-input');
        otpInputs.forEach(input => {
            input.value = '';
            // 触发input事件以更新React状态
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
    }

    // 添加验证码输入提示
    function addOtpInputHint() {
        // 查找验证码容器
        const otpContainer = document.querySelector('.verificationCode--o_u9MiU');
        if (!otpContainer) return;

        // 检查是否已经添加过提示
        if (document.getElementById('otp-hint')) return;

        // 创建提示元素
        const hintDiv = document.createElement('div');
        hintDiv.id = 'otp-hint';
        hintDiv.style.cssText = `
            margin-top: 10px;
            padding: 8px 12px;
            background: #f0f8ff;
            border: 1px solid #d6e4ff;
            border-radius: 6px;
            font-size: 12px;
            color: #1890ff;
            display: flex;
            align-items: center;
            gap: 8px;
        `;

        hintDiv.innerHTML = `
            <span>💡 提示：</span>
            <span>• 可以直接粘贴6位验证码</span>
            <span>• 填充后会自动跳转</span>
            <span>• 支持退格键返回</span>
            <span>• 错误时会自动清空重填</span>
        `;

        // 插入到验证码容器后面
        otpContainer.appendChild(hintDiv);
        addLog('📝 添加验证码输入提示', 'info');
    }

    // 监听页面路由变化（SPA应用）
    function setupRouteChangeListener() {
        let currentUrl = window.location.href;

        // 监听 URL 变化
        const checkUrlChange = () => {
            if (window.location.href !== currentUrl) {
                currentUrl = window.location.href;
                console.log('检测到页面路由变化:', currentUrl);

                // 延迟执行，确保页面内容已更新
                setTimeout(() => {
                    // 根据当前页面类型调用相应的检测函数
                    if (window.location.href.includes('/users/sign-up')) {
                        DetectSignupPage();
                    } else if (window.location.href.includes('/users/sign-in')) {
                        DetectSigninPage();
                    }
                }, 1000);
            }
        };

        // 使用多种方式监听路由变化
        // 1. 定时检查 URL 变化
        setInterval(checkUrlChange, 1000);

        // 2. 监听 popstate 事件（浏览器前进后退）
        window.addEventListener('popstate', () => {
            setTimeout(() => {
                if (window.location.href.includes('/users/sign-up')) {
                    DetectSignupPage();
                } else if (window.location.href.includes('/users/sign-in')) {
                    DetectSigninPage();
                }
            }, 1000);
        });

        // 3. 监听 pushstate 和 replacestate（编程式路由）
        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;

        history.pushState = function (...args) {
            originalPushState.apply(history, args);
            setTimeout(() => {
                if (window.location.href.includes('/users/sign-up')) {
                    DetectSignupPage();
                } else if (window.location.href.includes('/users/sign-in')) {
                    DetectSigninPage();
                }
            }, 1000);
        };

        history.replaceState = function (...args) {
            originalReplaceState.apply(history, args);
            setTimeout(() => {
                if (window.location.href.includes('/users/sign-up')) {
                    DetectSignupPage();
                } else if (window.location.href.includes('/users/sign-in')) {
                    DetectSigninPage();
                }
            }, 1000);
        };
    }

    // 页面加载完成后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            init();
            setupRouteChangeListener();
        });
    } else {
        init();
        setupRouteChangeListener();
    }

})();
