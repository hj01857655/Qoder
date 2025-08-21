// ==UserScript==
// @name         Qoder 注册助手
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  在Qoder注册页面提供注册助手面板，支持自动注册功能
// @author       hj0185765
// @match        https://qoder.com/*
// @match        https://*.qoder.com/*
// @grant        none
// @updateURL    https://raw.githubusercontent.com/hj01857655/Qoder/master/qoder.user.js
// @downloadURL  https://raw.githubusercontent.com/hj01857655/Qoder/master/qoder.user.js
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

    // 邮箱生成器
    function generateEmail() {
        const domains = ['gmail.com', 'outlook.com', 'yahoo.com', 'hotmail.com', 'qq.com', '163.com'];
        const adjectives = ['cool', 'smart', 'happy', 'bright', 'quick', 'fast', 'super', 'mega', 'ultra', 'pro'];
        const nouns = ['coder', 'dev', 'hacker', 'geek', 'ninja', 'master', 'guru', 'wizard', 'hero', 'star'];
        const numbers = Math.floor(Math.random() * 1000);

        const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
        const noun = nouns[Math.floor(Math.random() * nouns.length)];
        const domain = domains[Math.floor(Math.random() * domains.length)];

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


        

        // // 试直接调用React的onChange回调
        try {
            console.log('🔄 尝试方法7: 直接调用React onChange');
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
                    successMethod = '方法7: 直接调用React onChange';
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
                <h3 style="margin: 0; color: #333; font-size: 18px;">🚀 Qoder 注册助手</h3>
                <div style="display: flex; gap: 8px;">
                    <button id="clear-logs" style="background: #ff9800; color: white; border: none; border-radius: 4px; padding: 4px 8px; font-size: 12px; cursor: pointer;">清空日志</button>
                    <button id="close-register-panel" style="background: none; border: none; color: #666; font-size: 20px; cursor: pointer; padding: 0; width: 24px; height: 24px;">×</button>
                </div>
            </div>
            
            <div style="margin-bottom: 12px;">
                <button id="start-register" style="width: 100%; padding: 12px; background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%); color: white; border: none; border-radius: 8px; font-weight: 500; cursor: pointer; transition: all 0.3s ease;">开始注册</button>
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

        button.innerHTML = '🚀 去注册';

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



    // 开始注册流程
    function startRegistration() {
        addLog('🚀 开始注册流程', 'info');
        updateButtonState(true); // 设置按钮为运行状态

        // 生成用户信息
        const userInfo = {
            firstName: generateFirstName(),
            lastName: generateLastName(),
            email: generateEmail(),
            password: passwordGenerator.generate(12)
        };

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
            showToast('当前是邮箱验证码阶段，请手动输入验证码后点击Continue', 'info');
            updateButtonState(false);
        } else {
            addLog('⏳ 未检测到表单字段，等待页面加载', 'warning');
            showToast('正在等待页面加载...', 'info');
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
        
        history.pushState = function(...args) {
            originalPushState.apply(history, args);
            setTimeout(() => {
                if (window.location.href.includes('/users/sign-up')) {
                    DetectSignupPage();
                } else if (window.location.href.includes('/users/sign-in')) {
                    DetectSigninPage();
                }
            }, 1000);
        };
        
        history.replaceState = function(...args) {
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
