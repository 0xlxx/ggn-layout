import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.lang.reflect.*;
import java.util.function.Predicate;
import org.eclipse.elk.core.data.LayoutMetaDataService;
import org.eclipse.elk.core.options.CoreOptions;
import org.eclipse.elk.graph.ElkNode;
import org.eclipse.elk.alg.layered.graph.*;
import org.eclipse.elk.alg.layered.graph.LNode.NodeType;
import org.eclipse.elk.core.util.adapters.GraphAdapters.GraphAdapter;
import org.eclipse.elk.core.util.adapters.GraphAdapters.NodeAdapter;

/** 复刻 NodeLabelAndSizeCalculator 各阶段, dump E/W cell padding/content + nodeContainer minH. */
public class FlexCellProbe {
    public static void main(String[] args) throws Exception {
        LayoutMetaDataService.getInstance().registerLayoutMetaDataProviders();
        String json = new String(Files.readAllBytes(new java.io.File(args[0]).toPath()), StandardCharsets.UTF_8);
        ElkNode root = org.eclipse.elk.graph.json.ElkGraphJson.forGraph(json).toElk();
        root.setProperty(CoreOptions.ALGORITHM, "org.eclipse.elk.layered");
        Class<?> impCls = Class.forName("org.eclipse.elk.alg.layered.graph.transform.ElkGraphImporter");
        Constructor<?> impCtor = impCls.getDeclaredConstructor(); impCtor.setAccessible(true);
        Object importer = impCtor.newInstance();
        Method importGraph = impCls.getDeclaredMethod("importGraph", ElkNode.class); importGraph.setAccessible(true);
        LGraph lg = (LGraph) importGraph.invoke(importer, root);

        // 运行分层器使节点进入 layers (LGraphAdapter.getNodes 忽略 layerless)
        Class<?> layerer = Class.forName("org.eclipse.elk.alg.layered.p2layers.NetworkSimplexLayerer");
        Object layererInst = layerer.getDeclaredConstructor().newInstance();
        Class<?> procIf = Class.forName("org.eclipse.elk.core.alg.ILayoutProcessor");
        Class<?> monitorCls = Class.forName("org.eclipse.elk.core.util.IElkProgressMonitor");
        Method procMethod = procIf.getMethod("process", Object.class, monitorCls);
        procMethod.invoke(layererInst, lg, new org.eclipse.elk.core.util.BasicProgressMonitor());

        Class<?> adapters = Class.forName("org.eclipse.elk.alg.layered.graph.LGraphAdapters");
        Method adapt = adapters.getMethod("adapt", LGraph.class, boolean.class, boolean.class, Predicate.class);
        Object graphAdapter = adapt.invoke(null, lg, true, true, (Predicate<LNode>) n -> n.getType() == NodeType.NORMAL);

        Class<?> ncCls = Class.forName("org.eclipse.elk.alg.common.nodespacing.internal.NodeContext");
        Constructor<?> ncCtor = ncCls.getConstructor(GraphAdapter.class, NodeAdapter.class);
        Class<?> portCtx = Class.forName("org.eclipse.elk.alg.common.nodespacing.internal.algorithm.PortContextCreator");
        Class<?> labelCell = Class.forName("org.eclipse.elk.alg.common.nodespacing.internal.algorithm.NodeLabelCellCreator");
        Class<?> insidePort = Class.forName("org.eclipse.elk.alg.common.nodespacing.internal.algorithm.InsidePortLabelCellCreator");
        Class<?> utils = Class.forName("org.eclipse.elk.alg.common.nodespacing.internal.algorithm.NodeLabelAndSizeUtilities");
        Class<?> hCalc = Class.forName("org.eclipse.elk.alg.common.nodespacing.internal.algorithm.HorizontalPortPlacementSizeCalculator");
        Class<?> vCalc = Class.forName("org.eclipse.elk.alg.common.nodespacing.internal.algorithm.VerticalPortPlacementSizeCalculator");
        Class<?> cfg = Class.forName("org.eclipse.elk.alg.common.nodespacing.internal.algorithm.CellSystemConfigurator");
        Class<?> nsc = Class.forName("org.eclipse.elk.alg.common.nodespacing.internal.algorithm.NodeSizeCalculator");
        Class<?> atomic = Class.forName("org.eclipse.elk.alg.common.nodespacing.cellsystem.AtomicCell");
        Class<?> portSide = Class.forName("org.eclipse.elk.core.options.PortSide");
        Object EAST = Enum.valueOf((Class) portSide, "EAST");
        Object WEST = Enum.valueOf((Class) portSide, "WEST");

        Method mCreatePorts = portCtx.getMethod("createPortContexts", ncCls, boolean.class);
        Method mNodeLabels = labelCell.getMethod("createNodeLabelCells", ncCls, boolean.class, boolean.class);
        Method mInsidePorts = insidePort.getMethod("createInsidePortLabelCells", ncCls);
        Method mMinClient = utils.getMethod("setupMinimumClientAreaSize", ncCls);
        Method mPadOffset = utils.getMethod("setupNodePaddingForPortsWithOffset", ncCls);
        Method mHCalc = hCalc.getMethod("calculateHorizontalPortPlacementSize", ncCls);
        Method mVCalc = vCalc.getMethod("calculateVerticalPortPlacementSize", ncCls);
        Method mCfg = cfg.getMethod("configureCellSystemSizeContributions", ncCls);
        Method mUpdPad = cfg.getMethod("updateVerticalInsidePortLabelCellPadding", ncCls);
        Method mSetW = nsc.getMethod("setNodeWidth", ncCls);
        Method mSetH = nsc.getMethod("setNodeHeight", ncCls);
        Field fCells = ncCls.getField("insidePortLabelCells");
        Field fContainer = ncCls.getField("nodeContainer");
        Field fLabelCellSpacing = ncCls.getField("labelCellSpacing");
        Field fPortPort = ncCls.getField("portPortSpacing");
        Field fSurrounding = ncCls.getField("surroundingPortMargins");
        Method mMinH = Class.forName("org.eclipse.elk.alg.common.nodespacing.cellsystem.Cell").getMethod("getMinimumHeight");
        Method mGetPad = atomic.getMethod("getPadding");
        Method mGetContent = atomic.getMethod("getMinimumContentAreaSize");

        Iterable<?> nodes = (Iterable<?>) ((GraphAdapter) graphAdapter).getNodes();
        int idx = 0;
        for (Object nodeAdapter : nodes) {
            Object ctx = ncCtor.newInstance(graphAdapter, nodeAdapter);
            idx++;
            mCreatePorts.invoke(null, ctx, false);
            mNodeLabels.invoke(null, ctx, false, true);
            mInsidePorts.invoke(null, ctx);
            mMinClient.invoke(null, ctx);
            mPadOffset.invoke(null, ctx);
            mHCalc.invoke(null, ctx);
            mVCalc.invoke(null, ctx);
            mCfg.invoke(null, ctx);
            java.util.Map<?, ?> cells = (java.util.Map<?, ?>) fCells.get(ctx);
            Object eCell = cells.get(EAST), wCell = cells.get(WEST);
            Object container = fContainer.get(ctx);
            System.out.printf("node #%d%n", idx);
            System.out.printf("  labelCellSpacing=%.1f portPort=%.1f surrounding=%s%n",
                ((Number) fLabelCellSpacing.get(ctx)).doubleValue(),
                ((Number) fPortPort.get(ctx)).doubleValue(), fSurrounding.get(ctx));
            System.out.printf("  BEFORE updateVertical: E pad=%s content=%s | W pad=%s content=%s%n",
                mGetPad.invoke(eCell), mGetContent.invoke(eCell), mGetPad.invoke(wCell), mGetContent.invoke(wCell));
            System.out.printf("  nodeContainer minH=%.1f%n", ((Number) mMinH.invoke(container)).doubleValue());
            mUpdPad.invoke(null, ctx);
            System.out.printf("  AFTER updateVertical: E pad=%s content=%s | W pad=%s content=%s%n",
                mGetPad.invoke(eCell), mGetContent.invoke(eCell), mGetPad.invoke(wCell), mGetContent.invoke(wCell));
            mSetW.invoke(null, ctx);
            mSetH.invoke(null, ctx);
            System.out.printf("  nodeContainer minH=%.1f minW=%.1f%n",
                ((Number) mMinH.invoke(container)).doubleValue(),
                ((Number) Class.forName("org.eclipse.elk.alg.common.nodespacing.cellsystem.Cell").getMethod("getMinimumWidth").invoke(container)).doubleValue());
        }
    }
}
