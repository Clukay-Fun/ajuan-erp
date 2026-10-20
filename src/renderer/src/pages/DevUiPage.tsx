/**
 * 描述: 开发调试专用标准组件预览画板 (DevUiPage)
 * 主要功能:
 *   - 覆盖阶段 2 全部 18 类基础组件的所有变体、尺寸与异常状态
 *   - 支持浅色 (light) 与深色 (dark) 主题实时无缝切换
 *   - 支持模拟真实交互（抽屉多级滑出、弹窗确认、Toast 发射、Combobox 模糊查询）
 */

import React, { useState } from 'react'
import { Plus, Trash2, MoreHorizontal, Download, Upload, Sun, Moon, ExternalLink } from 'lucide-react'
import {
  Button,
  IconButton,
  Input,
  Textarea,
  NumberInput,
  Select,
  Combobox,
  DateInput,
  DateRangePicker,
  SegmentedControl,
  DocTypeBadge,
  DocStatusBadge,
  StockBadge,
  DrawerHost,
  useDrawer,
  ConfirmDialog,
  Menu,
  Tooltip,
  toast,
  ToastViewport,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableHeaderCell,
  Card,
  StatCard,
  EmptyState,
  PageHeader
} from '@/components/ui'
import styles from './DevUiPage.module.css'

// #region 抽屉测试内部动作区

function DrawerTriggerArea(): React.JSX.Element {
  const { openDrawer } = useDrawer()

  const handleOpenLevel2 = (): void => {
    openDrawer({
      id: 'sub-drawer',
      title: '商品调整详情（二级抽屉）',
      size: 'sm',
      content: ({ close }) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <p>这是二级抽屉，头部左侧应该显示带有上级标题的返回按钮。</p>
          <Button variant="secondary" onClick={() => close()}>
            完成关闭
          </Button>
        </div>
      )
    })
  }

  const handleOpenLevel1 = (size: 'sm' | 'md' | 'lg'): void => {
    openDrawer({
      id: 'main-drawer',
      title: `新建单据 (${size.toUpperCase()})`,
      size,
      content: () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <p>当前为主抽屉，可以继续点击下方按钮打开二级子抽屉验证返回历史：</p>
          <Button variant="primary" onClick={handleOpenLevel2}>
            打开下一级抽屉 (测试 5 级历史)
          </Button>
          <Input placeholder="输入测试数据..." />
        </div>
      ),
      footer: ({ close }) => (
        <>
          <Button variant="ghost" onClick={() => close()}>
            取消
          </Button>
          <Button variant="primary" onClick={() => close()}>
            提交生效
          </Button>
        </>
      )
    })
  }

  return (
    <div className={styles.row}>
      <Button variant="secondary" onClick={() => handleOpenLevel1('sm')}>
        打开小抽屉 (420px)
      </Button>
      <Button variant="secondary" onClick={() => handleOpenLevel1('md')}>
        打开中抽屉 (600px)
      </Button>
      <Button variant="secondary" onClick={() => handleOpenLevel1('lg')}>
        打开大抽屉 (760px)
      </Button>
    </div>
  )
}

// #endregion

// #region DevUiPage 主画板

export function DevUiPage(): React.JSX.Element {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [segmentedVal, setSegmentedVal] = useState('all')
  const [numberVal, setNumberVal] = useState<number | null>(128)
  const [selectVal, setSelectVal] = useState('option-1')
  const [dateRange, setDateRange] = useState({ from: '2026-03-01', to: '2026-03-15' })
  const [confirmOpen, setConfirmOpen] = useState(false)

  const toggleTheme = (): void => {
    const next = theme === 'light' ? 'dark' : 'light'
    setTheme(next)
    document.documentElement.setAttribute('data-theme', next)
  }

  const comboboxMockItems = [
    {
      id: '1',
      label: '高透亚克力双层展示立牌',
      sublabel: 'SPU-8821 · 现货',
      badge: <StockBadge status="ok" label="库存 531" />
    },
    {
      id: '2',
      label: '马口铁镭射碎玻璃徽章 58mm',
      sublabel: 'SPU-3091 · 告急',
      badge: <StockBadge status="critical" label="库存 3" />
    },
    {
      id: '3',
      label: '双闪色纸加厚收藏卡',
      sublabel: 'SPU-1024 · 预警',
      badge: <StockBadge status="low" label="库存 18" />
    }
  ]

  return (
    <DrawerHost>
      <div className={styles.page}>
        {/* 顶部控制栏 */}
        <div className={styles.topBar}>
          <div className={styles.titleArea}>
            <h1 className={styles.pageTitle}>阿卷 ERP · Base UI 组件库画板</h1>
            <span className={styles.subtitle}>/dev/ui · 阶段 2 设计规范全量对照</span>
          </div>

          <div className={styles.themeSwitcher}>
            <Button
              variant="secondary"
              size="sm"
              icon={theme === 'light' ? <Moon size={14} /> : <Sun size={14} />}
              onClick={toggleTheme}
            >
              切换为{theme === 'light' ? '深色' : '浅色'}主题
            </Button>
          </div>
        </div>

        {/* 0. 页面标头 PageHeader */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            <span>PageHeader 页面顶栏</span>
          </div>
          <PageHeader
            title="商品管理"
            count="共 42 件商品"
            actions={
              <>
                <Button size="sm" variant="secondary" icon={<Upload size={14} />}>
                  导入
                </Button>
                <Button size="sm" variant="primary" icon={<Plus size={14} />}>
                  新建商品
                </Button>
              </>
            }
          />
        </div>

        {/* 1. 按钮 Button & IconButton */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            <span>Button & IconButton 按钮体系</span>
          </div>
          <div className={styles.row}>
            <Button variant="primary" size="md">
              主要按钮 (Primary)
            </Button>
            <Button variant="secondary" size="md">
              次要按钮 (Secondary)
            </Button>
            <Button variant="ghost" size="md">
              幽灵按钮 (Ghost)
            </Button>
            <Button variant="danger" size="md">
              危险描边 (Danger)
            </Button>
            <Button variant="danger-solid" size="md">
              危险实心 (Solid)
            </Button>
            <Button variant="secondary" size="sm">
              小尺寸 (sm 28px)
            </Button>
            <Button variant="primary" loading>
              加载中
            </Button>
            <Button variant="secondary" disabledReason="当前单据已生效，禁止重复操作">
              带禁用原因 (disabledReason)
            </Button>
          </div>
          <div className={styles.row}>
            <IconButton label="新建出库单" icon={<Plus size={16} />} variant="secondary" />
            <IconButton label="更多操作" icon={<MoreHorizontal size={16} />} variant="ghost" />
            <IconButton label="删除草稿" icon={<Trash2 size={16} />} variant="danger" />
            <IconButton label="导出单据" icon={<Download size={16} />} variant="ghost" size="sm" />
            <IconButton label="无法导出" icon={<Download size={16} />} disabledReason="没有已选中的明细行" />
          </div>
        </div>

        {/* 2. 输入框 Input, Textarea, NumberInput */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            <span>Input / Textarea / NumberInput 录入套件</span>
          </div>
          <div className={styles.grid}>
            <Input placeholder="标准 32px 输入框..." />
            <Input placeholder="带前缀/后缀..." prefix="SKU-" suffix="件" />
            <Input placeholder="校验失败状态..." error="该商品编码已存在" />
            <Input value="只读状态内容" readOnly />
            <NumberInput value={numberVal} onChange={setNumberVal} prefix="¥" precision={2} placeholder="0.00" />
            <NumberInput value={42} suffix="件" step={5} min={0} placeholder="输入数量 (↑↓键微调)" />
          </div>
          <Textarea placeholder="输入单据备注或定制说明 (Textarea)..." />
        </div>

        {/* 3. 选择器与组合框 Select & Combobox */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            <span>Select & Combobox 选择与模糊过滤</span>
          </div>
          <div className={styles.grid}>
            <div>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Base UI 下拉菜单 (Select):</span>
              <Select
                value={selectVal}
                onChange={setSelectVal}
                options={[
                  { value: 'option-1', label: '默认仓库 (成品仓)' },
                  { value: 'option-2', label: '次品暂存仓' },
                  { value: 'option-3', label: '在途预留仓', disabled: true }
                ]}
              />
            </div>
            <div>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>商品模糊搜索组合框 (Combobox):</span>
              <Combobox items={comboboxMockItems} placeholder="搜索名称 / 编码 / 拼音..." />
            </div>
          </div>
        </div>

        {/* 4. 日期选择器 DateInput & DateRangePicker */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            <span>DateInput & DateRangePicker 会计区间</span>
          </div>
          <div className={styles.row}>
            <DateInput defaultValue="2026-03-20" />
            <DateRangePicker value={dateRange} onChange={setDateRange} />
          </div>
        </div>

        {/* 5. 分段控件与状态徽标 SegmentedControl & Badges */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            <span>SegmentedControl & Badge 状态与徽标</span>
          </div>
          <div className={styles.row}>
            <SegmentedControl
              value={segmentedVal}
              onChange={setSegmentedVal}
              options={[
                { value: 'all', label: '全部' },
                { value: 'draft', label: '草稿', count: 3 },
                { value: 'confirmed', label: '已生效', count: 28 },
                { value: 'voided', label: '已作废' }
              ]}
            />
          </div>
          <div className={styles.row}>
            <DocTypeBadge type="inbound" />
            <DocTypeBadge type="outbound" />
            <DocTypeBadge type="adjustment" />
            <DocTypeBadge type="opening" />
            <DocStatusBadge status="draft" />
            <DocStatusBadge status="confirmed" />
            <DocStatusBadge status="voided" />
            <StockBadge status="out" />
            <StockBadge status="critical" />
            <StockBadge status="low" />
            <StockBadge status="ok" />
            <StockBadge status="inactive" />
          </div>
        </div>

        {/* 6. 模态框与抽屉 ConfirmDialog & Drawer */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            <span>ConfirmDialog 模态确认 & DrawerHost 多级抽屉</span>
          </div>
          <div className={styles.row}>
            <Button variant="danger" onClick={() => setConfirmOpen(true)}>
              触发模态确认框 (ConfirmDialog)
            </Button>
            <DrawerTriggerArea />
          </div>
          <ConfirmDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            title="作废该出库单并冲回库存？"
            description="作废后该单据将不可恢复，系统将自动生成负向冲回流水，原出库扣减的库存与成本将自动原路返还。"
            confirmText="作废并冲回"
            danger
            onConfirm={() => {
              toast.success('单据已作废，库存已成功对冲回滚')
              setConfirmOpen(false)
            }}
          />
        </div>

        {/* 7. 操作菜单与浮层 Menu, Tooltip & Toast */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            <span>Menu 操作清单 & Toast 通知</span>
          </div>
          <div className={styles.row}>
            <Menu
              trigger={
                <Button variant="secondary" iconRight={<MoreHorizontal size={14} />}>
                  更多动作清单
                </Button>
              }
              items={[
                { key: 'edit', label: '编辑商品', shortcut: '⌘E' },
                { key: 'adjust', label: '录入调整单', shortcut: '⌘A' },
                'separator',
                {
                  key: 'delete',
                  label: '删除此项',
                  danger: true,
                  shortcut: '⌫',
                  onClick: () => toast.error('无法删除：已存在关联流水')
                }
              ]}
            />

            <Tooltip content="这是 400ms 延迟的标准气泡提示">
              <Button variant="ghost">悬停查看 Tooltip</Button>
            </Tooltip>

            <Button
              variant="secondary"
              onClick={() =>
                toast.success('数据已导出至 CSV', {
                  action: { label: '查看目录', onClick: () => alert('打开目录') }
                })
              }
            >
              发射 Success Toast
            </Button>
            <Button variant="secondary" onClick={() => toast.error('同步 Photoshop 连接失败：插件未启动')}>
              发射 Error Toast
            </Button>
          </div>
        </div>

        {/* 8. 表格 Table */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            <span>Table 36px 紧凑工作台表格</span>
          </div>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>单号</TableHeaderCell>
                <TableHeaderCell>类型</TableHeaderCell>
                <TableHeaderCell>状态</TableHeaderCell>
                <TableHeaderCell numeric>变动数量</TableHeaderCell>
                <TableHeaderCell numeric>结算金额</TableHeaderCell>
                <TableHeaderCell>操作</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              <TableRow clickable>
                <TableCell style={{ fontFamily: 'var(--font-mono)' }}>CK-20260320-001</TableCell>
                <TableCell>
                  <DocTypeBadge type="outbound" />
                </TableCell>
                <TableCell>
                  <DocStatusBadge status="confirmed" />
                </TableCell>
                <TableCell numeric>42 件</TableCell>
                <TableCell numeric>¥ 1,280.00</TableCell>
                <TableCell>
                  <IconButton label="查看详情" icon={<ExternalLink size={14} />} size="sm" />
                </TableCell>
              </TableRow>
              <TableRow clickable>
                <TableCell style={{ fontFamily: 'var(--font-mono)' }}>RK-20260320-002</TableCell>
                <TableCell>
                  <DocTypeBadge type="inbound" />
                </TableCell>
                <TableCell>
                  <DocStatusBadge status="draft" />
                </TableCell>
                <TableCell numeric>100 件</TableCell>
                <TableCell numeric>¥ 3,500.00</TableCell>
                <TableCell>
                  <IconButton label="查看详情" icon={<ExternalLink size={14} />} size="sm" />
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        {/* 9. 指标卡与空状态 StatCard & EmptyState */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            <span>Card / StatCard 指标卡 & EmptyState 空状态</span>
          </div>
          <div className={styles.grid}>
            <StatCard label="当前库存总量" value="5,240 件" changePercentage={12.4} subtext="较上周环比增长" />
            <StatCard label="本月出库金额" value="¥ 48,920.00" changePercentage={-3.2} subtext="已剔除作废单据" />
            <Card>
              <EmptyState
                title="暂无定制模板"
                description="请在 Photoshop 中完成 PSD 尺寸设计并点击导入。"
                actions={[{ label: '导入 PSD 模板', onClick: () => {} }]}
              />
            </Card>
          </div>
        </div>

        {/* 全局 Toast 挂载视口 */}
        <ToastViewport />
      </div>
    </DrawerHost>
  )
}

// #endregion
